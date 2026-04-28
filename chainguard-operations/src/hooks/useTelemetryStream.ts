import { useEffect, useRef, useState } from "react";
import type { DemoState } from "@/lib/chainguard-data";

export interface StreamPacket {
  id: string;
  ts: number;
  channel: "rfid" | "temp" | "humidity" | "tilt" | "chain";
  message: string;
  level: "info" | "success" | "warning" | "danger";
}

interface Options {
  state: DemoState;
  paused?: boolean;
}

/**
 * Simulated WebSocket telemetry stream.
 * Emulates a `wss://edge-042.chainguard.io/telemetry` socket using a local
 * EventTarget so the rest of the app can treat it like a real WS feed.
 */
export const useTelemetryStream = ({ state, paused }: Options) => {
  const [connected, setConnected] = useState(false);
  const [packets, setPackets] = useState<StreamPacket[]>([]);
  const [latencyMs, setLatencyMs] = useState(42);
  const counter = useRef(0);

  // "connect"
  useEffect(() => {
    const t = setTimeout(() => setConnected(true), 350);
    return () => {
      clearTimeout(t);
      setConnected(false);
    };
  }, []);

  // emit packets
  useEffect(() => {
    if (paused || !connected) return;
    const interval = state === "fraud" ? 900 : state === "warning" ? 1400 : 1800;

    const id = setInterval(() => {
      counter.current += 1;
      const n = counter.current;
      setLatencyMs(30 + Math.round(Math.random() * 40));

      const channels: StreamPacket["channel"][] = ["rfid", "temp", "humidity", "tilt", "chain"];
      const channel = channels[n % channels.length];

      let message = "";
      let level: StreamPacket["level"] = "info";

      if (channel === "temp") {
        const v = state === "fraud" ? 11.4 : state === "warning" ? 8.7 : 4.2;
        message = `temp=${(v + (Math.random() - 0.5) * 0.4).toFixed(2)}°C`;
        level = state === "fraud" ? "danger" : state === "warning" ? "warning" : "success";
      } else if (channel === "humidity") {
        const v = state === "fraud" ? 72 : state === "warning" ? 67 : 48;
        message = `rh=${Math.round(v + (Math.random() - 0.5) * 2)}%`;
        level = state === "normal" ? "success" : "warning";
      } else if (channel === "tilt") {
        const m = state === "fraud" ? 84 : 6;
        message = `imu.tilt=${m}° ${state === "fraud" ? "TAMPER" : "stable"}`;
        level = state === "fraud" ? "danger" : "success";
      } else if (channel === "rfid") {
        message = state === "fraud" ? "scan: RFID-XX-UNKNOWN ✗" : "scan: RFID-9F2A-77C1 ✓";
        level = state === "fraud" ? "danger" : "success";
      } else {
        message = `block #${(842113 + n).toString()} sealed`;
        level = "info";
      }

      const pkt: StreamPacket = {
        id: `pkt-${n}`,
        ts: Date.now(),
        channel,
        message,
        level,
      };
      setPackets((prev) => [pkt, ...prev].slice(0, 40));
    }, interval);
    return () => clearInterval(id);
  }, [state, paused, connected]);

  return { connected, packets, latencyMs };
};
