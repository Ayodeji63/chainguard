import { useState, useCallback } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { SupplyChainSourceAbi, supplyChainAddress } from "../../contract.js";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export interface SensorState {
  temperature: number;
  humidity: number;
  tilt: { magnitude: number; stable: boolean };
  tempRange: [number, number];
  humidityRange: [number, number];
  rfid: { lastId: string; valid: boolean; custodian: string };
  updatedAt: number;
}

export interface RfidScan {
  id: string;
  tag: string;
  valid: boolean;
  ts: number;
}

export interface PlaygroundState {
  sensors: SensorState;
  rfidScans: RfidScan[];
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

// ------------------------------------------------------------------
// Hook
// ------------------------------------------------------------------
export const useSensorPlayground = () => {
  const account = useAccount();
  const chain = account.chain;
  const {
    writeContract,
    isPending: isWriting,
    error: writeError,
  } = useWriteContract();

  const [state, setState] = useState<PlaygroundState>({
    sensors: {
      temperature: 4.2,
      humidity: 48,
      tilt: { magnitude: 6, stable: true },
      tempRange: [2, 8],
      humidityRange: [30, 60],
      rfid: {
        lastId: "RFID-9F2A-77C1",
        valid: true,
        custodian: "Transporter • 0x8B71…Aa02",
      },
      updatedAt: Date.now(),
    },
    rfidScans: [],
  });

  const update = useCallback((patch: Partial<SensorState>) => {
    setState((prev) => ({
      ...prev,
      sensors: { ...prev.sensors, ...patch, updatedAt: Date.now() },
    }));
  }, []);

  const updateTilt = useCallback((patch: Partial<SensorState["tilt"]>) => {
    setState((prev) => ({
      ...prev,
      sensors: {
        ...prev.sensors,
        tilt: { ...prev.sensors.tilt, ...patch },
        updatedAt: Date.now(),
      },
    }));
  }, []);

  const updateRfid = useCallback((patch: Partial<SensorState["rfid"]>) => {
    setState((prev) => ({
      ...prev,
      sensors: {
        ...prev.sensors,
        rfid: { ...prev.sensors.rfid, ...patch },
        updatedAt: Date.now(),
      },
    }));
  }, []);

  const pushScan = useCallback((tag: string, valid: boolean) => {
    const scan: RfidScan = {
      id: crypto.randomUUID(),
      tag,
      valid,
      ts: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      rfidScans: [scan, ...prev.rfidScans],
      sensors: {
        ...prev.sensors,
        rfid: { ...prev.sensors.rfid, lastId: tag, valid },
        updatedAt: Date.now(),
      },
    }));
    return scan;
  }, []);

  const reset = useCallback(() => {
    setState({
      sensors: {
        temperature: 4.2,
        humidity: 48,
        tilt: { magnitude: 6, stable: true },
        tempRange: [2, 8],
        humidityRange: [30, 60],
        rfid: {
          lastId: "RFID-9F2A-77C1",
          valid: true,
          custodian: "Transporter • 0x8B71…Aa02",
        },
        updatedAt: Date.now(),
      },
      rfidScans: [],
    });
  }, []);

  // ----------------------------------------------------------------
  // Blockchain — removed explicit chain/account, let wagmi handle it
  // ----------------------------------------------------------------
  const commitToChain = useCallback(
    (itemId: bigint, location: string) => {
      const { sensors } = state;
      writeContract(
        {
          abi: SupplyChainSourceAbi,
          address: supplyChainAddress,
          functionName: "reportConditions",
          args: [
            itemId,
            BigInt(Math.round(sensors.temperature * 100)),
            BigInt(sensors.humidity),
            !sensors.tilt.stable,
          ],
          chain: account.chain,
          account: account.address,
          gas: 400000, // set a fixed gas limit for simplicity; in production, consider estimating gas
        },
        {
          onSuccess: () => {
            console.log("reportConditions success");
          },
          onError: (err: any) => {
            console.error("reportConditions failed:", err);
          },
        },
      );
    },
    [state.sensors, writeContract],
  );

  const commitScanToChain = useCallback(
    (itemId: bigint, location: string) => {
      writeContract(
        {
          abi: SupplyChainSourceAbi,
          address: supplyChainAddress,
          functionName: "scanItem",
          args: [itemId, location],
          chain: account.chain,
          account: account.address,
          gas: 500000, // set a fixed gas limit for simplicity; in production, consider estimating gas
        },
        {
          onSuccess: () => {
            console.log("scanItem success");
          },
          onError: (err: any) => {
            console.error("scanItem failed:", err);
          },
        },
      );
    },
    [writeContract],
  );

  // ----------------------------------------------------------------
  // Backend
  // ----------------------------------------------------------------
  const syncToBackend = useCallback(
    async (
      itemId: string,
      type: "sensor" | "scan" = "sensor",
      location?: string,
    ) => {
      const payload =
        type === "sensor"
          ? {
              type: "sensor" as const,
              itemId,
              temperature: state.sensors.temperature,
              humidity: state.sensors.humidity,
              tiltDetected: !state.sensors.tilt.stable,
              tiltMagnitude: state.sensors.tilt.magnitude,
              rfidTag: state.sensors.rfid.lastId,
              rfidValid: state.sensors.rfid.valid,
              location,
              timestamp: new Date().toISOString(),
            }
          : {
              type: "scan" as const,
              itemId,
              rfidTag: state.sensors.rfid.lastId,
              rfidValid: state.sensors.rfid.valid,
              location,
              timestamp: new Date().toISOString(),
            };

      const res = await fetch(`${API_BASE}/api/sensors/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    [state.sensors],
  );

  return {
    state,
    update,
    updateTilt,
    updateRfid,
    pushScan,
    reset,
    commitToChain,
    commitScanToChain,
    syncToBackend,
    isWriting,
    writeError,
  };
};
