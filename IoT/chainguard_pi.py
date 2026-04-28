#!/usr/bin/env python3
"""
ChainGuard — Raspberry Pi Backend
──────────────────────────────────────────────────────────────
Sits between your Arduino sensors and Kwala.

What it does:
  1. Reads JSON events from Arduino over serial (USB)
  2. POSTs events to Kwala webhook endpoints
  3. Receives Kwala verdict (AUTHENTIC / FRAUD / BREACH / TAMPER)
  4. Sends LED command back to Arduino ("GREEN" / "RED" / "AMBER")
  5. Updates the local dashboard (served on port 5000)

Install dependencies on Pi:
  pip3 install pyserial requests flask flask-cors

Run:
  python3 chainguard_pi.py
"""

import serial
import json
import requests
import threading
import time
import hmac
import hashlib
import os
from datetime import datetime, timezone
from flask import Flask, jsonify, render_template_string
from flask_cors import CORS

# ── Configuration ─────────────────────────────────────────
SERIAL_PORT   = "/dev/ttyUSB0"   # change to /dev/ttyACM0 if needed
BAUD_RATE     = 9600

# Kwala webhook endpoints (replace with your actual Kwala URLs)
KWALA_SCAN_URL    = "https://api.kwala.network/webhook/chainguard-scan"
KWALA_SENSOR_URL  = "https://api.kwala.network/webhook/chainguard-sensor"
KWALA_TAMPER_URL  = "https://api.kwala.network/webhook/chainguard-tamper"

# Your Kwala webhook secret (set this in Kwala dashboard)
KWALA_SECRET      = os.environ.get("KWALA_SECRET", "your-kwala-secret-here")

# Thresholds for on-chain alerts
TEMP_MAX_C        = 8.0    # above this = cold chain breach
HUMIDITY_MAX_PCT  = 85.0   # above this = humidity breach
TEMP_MIN_C        = 2.0    # below this = too cold

# Demo location (hardcoded for hackathon — in production, use GPS)
DEMO_LOCATION     = {"lat": 6.5244, "lng": 3.3792, "label": "Lagos Warehouse"}

# ── State ─────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

state = {
    "rfid_uid":       None,
    "temp":           None,
    "humidity":       None,
    "tilted":         False,
    "last_verdict":   None,
    "events":         [],          # list of recent events for dashboard
    "scan_count":     0,
    "fraud_count":    0,
    "breach_count":   0,
    "tamper_count":   0,
}

ser = None   # serial connection to Arduino

# ── Helpers ───────────────────────────────────────────────
def now_iso():
    return datetime.now(timezone.utc).isoformat()

def sign_payload(payload: dict) -> str:
    """HMAC-SHA256 sign the payload so Kwala can verify it came from us."""
    body = json.dumps(payload, separators=(",", ":"))
    sig  = hmac.new(
        KWALA_SECRET.encode(),
        body.encode(),
        hashlib.sha256
    ).hexdigest()
    return sig

def post_to_kwala(url: str, payload: dict) -> dict:
    """POST signed JSON to a Kwala webhook. Returns the response JSON."""
    sig = sign_payload(payload)
    headers = {
        "Content-Type":      "application/json",
        "X-ChainGuard-Sig":  sig,
    }
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.RequestException as e:
        print(f"[Kwala] POST failed: {e}")
        return {"status": "error", "message": str(e)}

def send_arduino_command(cmd: str):
    """Send a LED command back to Arduino over serial."""
    if ser and ser.is_open:
        ser.write((cmd + "\n").encode())
        print(f"[Arduino] Sent command: {cmd}")

def add_event(event_type: str, data: dict, verdict: str = None):
    """Add event to the dashboard state list (keep last 20)."""
    entry = {
        "time":    now_iso(),
        "type":    event_type,
        "data":    data,
        "verdict": verdict,
    }
    state["events"].insert(0, entry)
    state["events"] = state["events"][:20]

# ── Event handlers ────────────────────────────────────────

def handle_rfid(uid: str):
    """Called when Arduino reports a new RFID scan."""
    print(f"\n[RFID] Card scanned: {uid}")
    state["rfid_uid"]   = uid
    state["scan_count"] += 1

    payload = {
        "uid":       uid,
        "location":  DEMO_LOCATION,
        "timestamp": now_iso(),
        "temp":      state["temp"],
        "humidity":  state["humidity"],
        "tilted":    state["tilted"],
    }

    print("[Kwala] Sending scan event...")
    result = post_to_kwala(KWALA_SCAN_URL, payload)
    print(f"[Kwala] Response: {result}")

    verdict = result.get("status", "UNKNOWN")
    state["last_verdict"] = verdict

    if verdict == "AUTHENTIC":
        print("[Result] AUTHENTIC — custody logged on-chain")
        send_arduino_command("GREEN")
        add_event("RFID scan", {"uid": uid}, "AUTHENTIC")

    elif verdict == "FRAUD":
        print("[Result] FRAUD DETECTED — product frozen on-chain!")
        state["fraud_count"] += 1
        send_arduino_command("RED")
        add_event("RFID scan", {"uid": uid}, "FRAUD")

    else:
        print(f"[Result] Unexpected verdict: {verdict}")
        send_arduino_command("OFF")
        add_event("RFID scan", {"uid": uid}, verdict)

    # turn LED off after 4 seconds
    threading.Timer(4.0, lambda: send_arduino_command("OFF")).start()


def handle_sensor(temp: float, humidity: float, tilted: bool):
    """Called every 5 seconds with DHT22 + tilt readings."""
    state["temp"]     = temp
    state["humidity"] = humidity
    state["tilted"]   = tilted

    print(f"[Sensor] Temp: {temp}°C  Humidity: {humidity}%  Tilted: {tilted}")

    # Check thresholds — only POST to Kwala if breached
    breached      = temp > TEMP_MAX_C or temp < TEMP_MIN_C or humidity > HUMIDITY_MAX_PCT

    if breached:
        reason = []
        if temp > TEMP_MAX_C:
            reason.append(f"temp {temp}°C > max {TEMP_MAX_C}°C")
        if temp < TEMP_MIN_C:
            reason.append(f"temp {temp}°C < min {TEMP_MIN_C}°C")
        if humidity > HUMIDITY_MAX_PCT:
            reason.append(f"humidity {humidity}% > max {HUMIDITY_MAX_PCT}%")

        print(f"[Sensor] BREACH: {', '.join(reason)}")
        state["breach_count"] += 1

        payload = {
            "temp":      temp,
            "humidity":  humidity,
            "breach":    True,
            "reason":    reason,
            "uid":       state["rfid_uid"],
            "location":  DEMO_LOCATION,
            "timestamp": now_iso(),
        }

        print("[Kwala] Sending breach event...")
        result = post_to_kwala(KWALA_SENSOR_URL, payload)
        print(f"[Kwala] Response: {result}")

        send_arduino_command("AMBER")
        add_event("Temp/humidity breach", {
            "temp": temp, "humidity": humidity, "reason": reason
        }, "BREACH")
        threading.Timer(4.0, lambda: send_arduino_command("OFF")).start()


def handle_tilt(tilted: bool):
    """Called when tilt state changes."""
    if not tilted:
        return   # only alert when it tips — not when it recovers

    print("[Tilt] TAMPER DETECTED — package tilted!")
    state["tamper_count"] += 1

    payload = {
        "tilted":    True,
        "uid":       state["rfid_uid"],
        "location":  DEMO_LOCATION,
        "timestamp": now_iso(),
    }

    print("[Kwala] Sending tamper event...")
    result = post_to_kwala(KWALA_TAMPER_URL, payload)
    print(f"[Kwala] Response: {result}")

    send_arduino_command("RED")
    add_event("Tamper detected", {"tilted": True}, "TAMPER")
    threading.Timer(4.0, lambda: send_arduino_command("OFF")).start()

# ── Serial reader thread ──────────────────────────────────

def read_serial():
    """Continuously reads JSON lines from Arduino."""
    global ser
    while True:
        try:
            ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
            print(f"[Serial] Connected to Arduino on {SERIAL_PORT}")
            while True:
                line = ser.readline().decode("utf-8", errors="ignore").strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    event_type = data.get("type")

                    if event_type == "rfid":
                        handle_rfid(data["uid"])

                    elif event_type == "sensor":
                        handle_sensor(
                            float(data["temp"]),
                            float(data["humidity"]),
                            bool(data.get("tilted", False))
                        )

                    elif event_type == "tilt":
                        handle_tilt(bool(data["tilted"]))

                    elif event_type == "status":
                        print(f"[Arduino] {data.get('msg', '')}")

                except json.JSONDecodeError:
                    print(f"[Serial] Non-JSON line: {line}")

        except serial.SerialException as e:
            print(f"[Serial] Connection error: {e}. Retrying in 3s...")
            time.sleep(3)

# ── Dashboard API ─────────────────────────────────────────

@app.route("/api/state")
def api_state():
    return jsonify({
        "rfid_uid":     state["rfid_uid"],
        "temp":         state["temp"],
        "humidity":     state["humidity"],
        "tilted":       state["tilted"],
        "last_verdict": state["last_verdict"],
        "scan_count":   state["scan_count"],
        "fraud_count":  state["fraud_count"],
        "breach_count": state["breach_count"],
        "tamper_count": state["tamper_count"],
        "events":       state["events"][:10],
    })

@app.route("/api/events")
def api_events():
    return jsonify(state["events"])

@app.route("/")
def dashboard():
    return render_template_string(DASHBOARD_HTML)

# ── Simple dashboard HTML served from Pi ──────────────────
DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ChainGuard Live</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#050d1a;color:#f0f4f8;padding:20px}
  h1{font-size:20px;font-weight:700;color:#00e5b4;margin-bottom:4px}
  .sub{font-size:12px;color:#7f8c9b;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px}
  .card{background:#0a1628;border:1px solid rgba(0,229,180,0.15);border-radius:10px;padding:14px}
  .card-label{font-size:10px;color:#7f8c9b;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}
  .card-value{font-size:26px;font-weight:700}
  .teal{color:#00e5b4} .red{color:#ff4757} .amber{color:#ffa502} .green{color:#2ed573}
  .events{background:#0a1628;border:1px solid rgba(0,229,180,0.15);border-radius:10px;padding:16px}
  .events h2{font-size:13px;color:#00e5b4;margin-bottom:12px;letter-spacing:1px}
  .event{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);align-items:center}
  .event:last-child{border-bottom:none}
  .event-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .event-body{flex:1}
  .event-title{font-size:12px;font-weight:500}
  .event-time{font-size:10px;color:#7f8c9b;font-family:monospace}
  .badge{font-size:10px;padding:2px 8px;border-radius:8px;font-family:monospace}
  .AUTHENTIC,.ok{background:rgba(46,213,115,0.15);color:#2ed573}
  .FRAUD,.TAMPER{background:rgba(255,71,87,0.15);color:#ff4757}
  .BREACH{background:rgba(255,165,2,0.15);color:#ffa502}
  .sensor-row{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}
  .sensor-box{background:#0a1628;border:1px solid rgba(0,229,180,0.15);border-radius:10px;padding:14px;flex:1;min-width:140px}
</style>
</head>
<body>
<h1>ChainGuard</h1>
<p class="sub">Live sensor monitoring · Kwala automation · On-chain enforcement</p>

<div class="grid">
  <div class="card"><div class="card-label">Scans</div><div class="card-value teal" id="scans">0</div></div>
  <div class="card"><div class="card-label">Fraud alerts</div><div class="card-value red" id="frauds">0</div></div>
  <div class="card"><div class="card-label">Breaches</div><div class="card-value amber" id="breaches">0</div></div>
  <div class="card"><div class="card-label">Tamper events</div><div class="card-value red" id="tampers">0</div></div>
</div>

<div class="sensor-row">
  <div class="sensor-box">
    <div class="card-label">Temperature</div>
    <div class="card-value teal" id="temp">--</div>
  </div>
  <div class="sensor-box">
    <div class="card-label">Humidity</div>
    <div class="card-value teal" id="humidity">--</div>
  </div>
  <div class="sensor-box">
    <div class="card-label">Tilt status</div>
    <div class="card-value" id="tilt" style="color:#2ed573">Normal</div>
  </div>
  <div class="sensor-box">
    <div class="card-label">Last RFID</div>
    <div style="font-family:monospace;font-size:13px;color:#00e5b4;margin-top:6px" id="uid">--</div>
  </div>
</div>

<div class="events">
  <h2>LIVE EVENT LOG</h2>
  <div id="event-list"><p style="color:#7f8c9b;font-size:12px">Waiting for events...</p></div>
</div>

<script>
function poll() {
  fetch('/api/state').then(r=>r.json()).then(s=>{
    document.getElementById('scans').textContent    = s.scan_count;
    document.getElementById('frauds').textContent   = s.fraud_count;
    document.getElementById('breaches').textContent = s.breach_count;
    document.getElementById('tampers').textContent  = s.tamper_count;
    document.getElementById('temp').textContent     = s.temp ? s.temp + '°C' : '--';
    document.getElementById('humidity').textContent = s.humidity ? s.humidity + '%' : '--';
    document.getElementById('uid').textContent      = s.rfid_uid || '--';
    const tiltEl = document.getElementById('tilt');
    tiltEl.textContent = s.tilted ? 'TILTED!' : 'Normal';
    tiltEl.style.color = s.tilted ? '#ff4757' : '#2ed573';

    const list = document.getElementById('event-list');
    if (s.events.length === 0) return;
    list.innerHTML = s.events.map(e => {
      const color = e.verdict === 'AUTHENTIC' ? '#2ed573'
                  : e.verdict === 'FRAUD' || e.verdict === 'TAMPER' ? '#ff4757'
                  : '#ffa502';
      const t = new Date(e.time).toLocaleTimeString();
      return '<div class="event">'
        + '<div class="event-dot" style="background:' + color + '"></div>'
        + '<div class="event-body">'
        + '<div class="event-title">' + e.type + '</div>'
        + '<div class="event-time">' + t + '</div>'
        + '</div>'
        + '<span class="badge ' + e.verdict + '">' + (e.verdict||'') + '</span>'
        + '</div>';
    }).join('');
  }).catch(()=>{});
}
poll();
setInterval(poll, 2000);
</script>
</body>
</html>
"""

# ── Main ──────────────────────────────────────────────────

if __name__ == "__main__":
    # Start serial reader in background thread
    serial_thread = threading.Thread(target=read_serial, daemon=True)
    serial_thread.start()

    # Start Flask dashboard
    print("\n ChainGuard Pi Backend starting...")
    print(f" Dashboard: http://localhost:5000")
    print(f" Serial:    {SERIAL_PORT} @ {BAUD_RATE} baud")
    print(f" Kwala:     {KWALA_SCAN_URL}\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
