export type DemoState = "normal" | "warning" | "fraud";

export type CheckpointStatus = "completed" | "current" | "pending" | "anomaly";

export interface Checkpoint {
  id: string;
  name: string;
  type: "factory" | "warehouse" | "transit" | "retailer";
  // Map coordinates as percentages (0-100) within the SVG canvas
  x: number;
  y: number;
  timestamp: string;
  actor: string;
  wallet: string;
  scanStatus: "Valid" | "Unauthorized" | "Pending";
  status: CheckpointStatus;
}

export interface TimelineEvent {
  id: string;
  title: string;
  location: string;
  actor: string;
  timestamp: string;
  status: "info" | "success" | "warning" | "danger";
  icon: "package" | "truck" | "scan" | "thermo" | "alert" | "shield";
}

export interface SensorSnapshot {
  rfid: {
    lastId: string;
    custodian: string;
    valid: boolean;
  };
  temperature: number; // °C
  tempRange: [number, number];
  humidity: number; // %
  humidityRange: [number, number];
  tilt: {
    stable: boolean;
    magnitude: number; // 0-100
  };
}

export interface ProductInfo {
  batchId: string;
  product: string;
  origin: string;
  destination: string;
  shipmentStatus: "In Transit" | "Delivered" | "Frozen";
  progress: number; // 0-100
}

export interface ChainGuardData {
  state: DemoState;
  checkpoints: Checkpoint[];
  events: TimelineEvent[];
  sensors: SensorSnapshot;
  product: ProductInfo;
  alert?: { title: string; message: string; node?: string };
}

const baseCheckpoints: Checkpoint[] = [
  {
    id: "cp-1",
    name: "Shenzhen Factory",
    type: "factory",
    x: 18,
    y: 62,
    timestamp: "2026-04-21 08:14 UTC",
    actor: "Manufacturer",
    wallet: "0x4F2a…91Bc",
    scanStatus: "Valid",
    status: "completed",
  },
  {
    id: "cp-2",
    name: "Hong Kong Port",
    type: "transit",
    x: 34,
    y: 56,
    timestamp: "2026-04-21 19:02 UTC",
    actor: "Transporter",
    wallet: "0x8B71…Aa02",
    scanStatus: "Valid",
    status: "completed",
  },
  {
    id: "cp-3",
    name: "Warehouse B — Rotterdam",
    type: "warehouse",
    x: 58,
    y: 38,
    timestamp: "2026-04-23 04:48 UTC",
    actor: "Transporter",
    wallet: "0x8B71…Aa02",
    scanStatus: "Valid",
    status: "current",
  },
  {
    id: "cp-4",
    name: "Hamburg Distribution",
    type: "transit",
    x: 72,
    y: 30,
    timestamp: "ETA 2026-04-24 09:00",
    actor: "Transporter",
    wallet: "0x8B71…Aa02",
    scanStatus: "Pending",
    status: "pending",
  },
  {
    id: "cp-5",
    name: "Berlin Retailer",
    type: "retailer",
    x: 86,
    y: 24,
    timestamp: "ETA 2026-04-24 18:30",
    actor: "Retailer",
    wallet: "0xDEa0…7711",
    scanStatus: "Pending",
    status: "pending",
  },
];

const baseEvents: TimelineEvent[] = [
  { id: "e1", title: "Batch Created", location: "Shenzhen Factory", actor: "Manufacturer", timestamp: "08:14 UTC", status: "info", icon: "package" },
  { id: "e2", title: "Transferred to Transporter", location: "Shenzhen Factory", actor: "0x4F2a → 0x8B71", timestamp: "09:02 UTC", status: "success", icon: "shield" },
  { id: "e3", title: "Departed Hong Kong Port", location: "HK Port", actor: "Transporter", timestamp: "19:02 UTC", status: "info", icon: "truck" },
  { id: "e4", title: "Scanned at Warehouse B", location: "Rotterdam", actor: "Transporter", timestamp: "04:48 UTC", status: "success", icon: "scan" },
];

export const buildData = (state: DemoState): ChainGuardData => {
  const checkpoints = baseCheckpoints.map((c) => ({ ...c }));
  const events = [...baseEvents];

  let sensors: SensorSnapshot = {
    rfid: { lastId: "RFID-9F2A-77C1", custodian: "Transporter • 0x8B71…Aa02", valid: true },
    temperature: 4.2,
    tempRange: [2, 8],
    humidity: 48,
    humidityRange: [35, 65],
    tilt: { stable: true, magnitude: 6 },
  };

  let product: ProductInfo = {
    batchId: "BATCH-CG-2026-04821",
    product: "mRNA Vaccine • 1,200 vials",
    origin: "Shenzhen, CN",
    destination: "Berlin, DE",
    shipmentStatus: "In Transit",
    progress: 62,
  };

  let alert: ChainGuardData["alert"];

  if (state === "warning") {
    sensors = {
      ...sensors,
      temperature: 8.7,
      humidity: 67,
    };
    events.push({
      id: "e5",
      title: "Temperature Spike Detected",
      location: "Warehouse B — Rotterdam",
      actor: "Sensor • TH-02",
      timestamp: "05:11 UTC",
      status: "warning",
      icon: "thermo",
    });
    alert = {
      title: "WARNING",
      message: "Cold-chain breach: Temperature 8.7°C exceeds 8.0°C threshold at Warehouse B",
      node: "cp-3",
    };
  }

  if (state === "fraud") {
    sensors = {
      rfid: { lastId: "RFID-XX-UNKNOWN", custodian: "UNVERIFIED • 0x???…????", valid: false },
      temperature: 11.4,
      tempRange: [2, 8],
      humidity: 72,
      humidityRange: [35, 65],
      tilt: { stable: false, magnitude: 84 },
    };
    checkpoints[2].status = "anomaly";
    checkpoints[2].scanStatus = "Unauthorized";
    product = { ...product, shipmentStatus: "Frozen", progress: 62 };
    events.push(
      { id: "e5", title: "Temperature Spike Detected", location: "Warehouse B", actor: "Sensor • TH-02", timestamp: "05:11 UTC", status: "warning", icon: "thermo" },
      { id: "e6", title: "Tilt Anomaly — 84° Impact", location: "Warehouse B", actor: "Sensor • IMU-01", timestamp: "05:14 UTC", status: "warning", icon: "alert" },
      { id: "e7", title: "Unauthorized RFID Scan", location: "Warehouse B", actor: "0x???…????", timestamp: "05:15 UTC", status: "danger", icon: "scan" },
      { id: "e8", title: "FRAUD DETECTED — Shipment Frozen", location: "Warehouse B", actor: "Kwala Automation", timestamp: "05:15 UTC", status: "danger", icon: "alert" },
    );
    alert = {
      title: "FRAUD DETECTED",
      message: "Unauthorized scan at Warehouse B — Shipment automatically frozen by Kwala",
      node: "cp-3",
    };
  }

  return { state, checkpoints, events, sensors, product, alert };
};
