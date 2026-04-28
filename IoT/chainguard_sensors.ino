/*
 * ChainGuard — Arduino Sensor Node
 * ─────────────────────────────────────────────────────────
 * Reads:
 *   - RC522 RFID reader  (SPI: pins 10,11,12,13 + RST=9)
 *   - DHT22 temp/humidity sensor (pin 7)
 *   - Tilt sensor (digital pin 6)
 *
 * Outputs:
 *   - JSON over Serial (9600 baud) to Raspberry Pi
 *   - Receives LED commands from Pi: "GREEN", "RED", "AMBER", "OFF"
 *
 * Wiring:
 *   RC522  → Arduino
 *     SDA  → pin 10 (SS)
 *     SCK  → pin 13
 *     MOSI → pin 11
 *     MISO → pin 12
 *     RST  → pin 9
 *     3.3V → 3.3V
 *     GND  → GND
 *
 *   DHT22  → Arduino
 *     VCC  → 5V
 *     DATA → pin 7
 *     GND  → GND
 *
 *   Tilt sensor → Arduino
 *     One leg  → pin 6
 *     Other leg → GND
 *     (enable INPUT_PULLUP — LOW = tilted)
 *
 *   LEDs + Buzzer → Arduino
 *     Green LED → pin 3 (with 220ohm resistor)
 *     Red LED   → pin 4 (with 220ohm resistor)
 *     Amber LED → pin 5 (with 220ohm resistor)
 *     Buzzer    → pin 8
 *
 * Libraries needed (install via Arduino Library Manager):
 *   - MFRC522  (by GithubCommunity)
 *   - DHT sensor library (by Adafruit)
 *   - ArduinoJson (by Benoit Blanchon)
 */

#include <SPI.h>
#include <MFRC522.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ── Pin definitions ──────────────────────────────────────
#define RFID_SS_PIN   10
#define RFID_RST_PIN   9
#define DHT_PIN        7
#define DHT_TYPE    DHT22
#define TILT_PIN       6
#define LED_GREEN      3
#define LED_RED        4
#define LED_AMBER      5
#define BUZZER         8

// ── Sensor objects ───────────────────────────────────────
MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);
DHT dht(DHT_PIN, DHT_TYPE);

// ── Timing ───────────────────────────────────────────────
unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL = 5000; // read every 5 seconds

// ── State ────────────────────────────────────────────────
bool lastTiltState = false;
String lastUID = "";

// ────────────────────────────────────────────────────────
void setup() {
  Serial.begin(9600);
  SPI.begin();
  rfid.PCD_Init();
  dht.begin();

  pinMode(TILT_PIN, INPUT_PULLUP);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED,   OUTPUT);
  pinMode(LED_AMBER, OUTPUT);
  pinMode(BUZZER,    OUTPUT);

  allLedsOff();
  flashStartup();

  Serial.println("{\"type\":\"status\",\"msg\":\"ChainGuard Arduino ready\"}");
}

// ────────────────────────────────────────────────────────
void loop() {

  // ── 1. Check for RFID card ──────────────────────────
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String uid = getUID();
    if (uid != lastUID) {           // debounce: ignore same card held on
      lastUID = uid;
      sendRFIDEvent(uid);
    }
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  } else {
    if (lastUID != "") lastUID = ""; // reset when card removed
  }

  // ── 2. Read DHT22 + tilt on interval ───────────────
  unsigned long now = millis();
  if (now - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = now;

    float temp = dht.readTemperature();
    float humidity = dht.readHumidity();

    if (!isnan(temp) && !isnan(humidity)) {
      sendSensorEvent(temp, humidity);
    }

    // tilt state change detection
    bool tilted = (digitalRead(TILT_PIN) == LOW);
    if (tilted && !lastTiltState) {
      sendTiltEvent(true);
    } else if (!tilted && lastTiltState) {
      sendTiltEvent(false);
    }
    lastTiltState = tilted;
  }

  // ── 3. Listen for LED commands from Pi ─────────────
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    handleLEDCommand(cmd);
  }
}

// ────────────────────────────────────────────────────────
// Build and send RFID event JSON
void sendRFIDEvent(String uid) {
  StaticJsonDocument<128> doc;
  doc["type"] = "rfid";
  doc["uid"]  = uid;
  serializeJson(doc, Serial);
  Serial.println();
}

// Build and send sensor event JSON
void sendSensorEvent(float temp, float humidity) {
  StaticJsonDocument<128> doc;
  doc["type"]     = "sensor";
  doc["temp"]     = serialized(String(temp, 1));
  doc["humidity"] = serialized(String(humidity, 1));
  doc["tilted"]   = (digitalRead(TILT_PIN) == LOW);
  serializeJson(doc, Serial);
  Serial.println();
}

// Build and send tilt event JSON
void sendTiltEvent(bool tilted) {
  StaticJsonDocument<64> doc;
  doc["type"]   = "tilt";
  doc["tilted"] = tilted;
  serializeJson(doc, Serial);
  Serial.println();
}

// ────────────────────────────────────────────────────────
// Read UID bytes and return as hex string "A3:F7:B2:E9"
String getUID() {
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (i > 0) uid += ":";
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

// ────────────────────────────────────────────────────────
// Handle LED/buzzer commands sent back from Pi
void handleLEDCommand(String cmd) {
  allLedsOff();
  if (cmd == "GREEN") {
    digitalWrite(LED_GREEN, HIGH);
  } else if (cmd == "RED") {
    digitalWrite(LED_RED, HIGH);
    buzz(3, 200);
  } else if (cmd == "AMBER") {
    digitalWrite(LED_AMBER, HIGH);
    buzz(1, 500);
  } else if (cmd == "OFF") {
    // already off
  }
}

// ────────────────────────────────────────────────────────
void allLedsOff() {
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED,   LOW);
  digitalWrite(LED_AMBER, LOW);
  digitalWrite(BUZZER,    LOW);
}

void buzz(int times, int duration) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER, HIGH);
    delay(duration);
    digitalWrite(BUZZER, LOW);
    if (i < times - 1) delay(150);
  }
}

void flashStartup() {
  // quick green-red-green flash to confirm boot
  digitalWrite(LED_GREEN, HIGH); delay(200);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED,   HIGH); delay(200);
  digitalWrite(LED_RED,   LOW);
  digitalWrite(LED_GREEN, HIGH); delay(200);
  digitalWrite(LED_GREEN, LOW);
}
