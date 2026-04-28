import { motion } from "framer-motion";
import { Radio, Thermometer, Droplets, Activity, CheckCircle2, XCircle } from "lucide-react";
import type { SensorSnapshot } from "@/lib/chainguard-data";

interface SensorPanelProps {
  sensors: SensorSnapshot;
}

const tone = (ok: boolean, warn = false) =>
  ok
    ? "border-success/30 bg-success/10 text-success"
    : warn
    ? "border-warning/30 bg-warning/10 text-warning"
    : "border-destructive/40 bg-destructive/10 text-destructive";

export const SensorPanel = ({ sensors }: SensorPanelProps) => {
  const tempOk = sensors.temperature >= sensors.tempRange[0] && sensors.temperature <= sensors.tempRange[1];
  const tempWarn = !tempOk && sensors.temperature <= sensors.tempRange[1] + 1.5;
  const humidOk = sensors.humidity >= sensors.humidityRange[0] && sensors.humidity <= sensors.humidityRange[1];

  return (
    <div className="glass flex h-full flex-col gap-3 overflow-y-auto rounded-2xl p-4 scrollbar-thin">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Sensor Telemetry</h2>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          LIVE · 1s
        </span>
      </div>

      {/* RFID */}
      <SensorCard
        title="RFID Custody"
        icon={Radio}
        toneCls={tone(sensors.rfid.valid)}
      >
        <div className="space-y-1.5">
          <Row label="Last Scan ID" value={<span className="font-mono">{sensors.rfid.lastId}</span>} />
          <Row label="Custodian" value={<span className="truncate font-mono text-[11px]">{sensors.rfid.custodian}</span>} />
          <Row
            label="Validity"
            value={
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                sensors.rfid.valid ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
              }`}>
                {sensors.rfid.valid ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {sensors.rfid.valid ? "Valid" : "Unauthorized"}
              </span>
            }
          />
        </div>
      </SensorCard>

      {/* Temperature */}
      <SensorCard
        title="Temperature"
        icon={Thermometer}
        toneCls={tone(tempOk, tempWarn)}
      >
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-1">
            <motion.span
              key={sensors.temperature}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-mono text-3xl font-bold tabular-nums"
            >
              {sensors.temperature.toFixed(1)}
            </motion.span>
            <span className="text-sm text-muted-foreground">°C</span>
          </div>
          <div className="text-right text-[10px] text-muted-foreground">
            <div>Range</div>
            <div className="font-mono">{sensors.tempRange[0]}°–{sensors.tempRange[1]}°C</div>
          </div>
        </div>
        <Gauge value={sensors.temperature} min={-2} max={14} range={sensors.tempRange} />
      </SensorCard>

      {/* Humidity */}
      <SensorCard title="Humidity" icon={Droplets} toneCls={tone(humidOk)}>
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-3xl font-bold tabular-nums">{sensors.humidity}</span>
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <div className="text-right text-[10px] text-muted-foreground">
            <div>Range</div>
            <div className="font-mono">{sensors.humidityRange[0]}–{sensors.humidityRange[1]}%</div>
          </div>
        </div>
        <Gauge value={sensors.humidity} min={20} max={90} range={sensors.humidityRange} />
      </SensorCard>

      {/* Tilt */}
      <SensorCard
        title="Tilt / Impact"
        icon={Activity}
        toneCls={tone(sensors.tilt.stable)}
      >
        <div className="flex items-center justify-between">
          <span className={`font-bold ${sensors.tilt.stable ? "text-success" : "text-destructive"}`}>
            {sensors.tilt.stable ? "Stable" : "Tampered"}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{sensors.tilt.magnitude}°</span>
        </div>
        <SpikeViz magnitude={sensors.tilt.magnitude} alarm={!sensors.tilt.stable} />
      </SensorCard>
    </div>
  );
};

const SensorCard = ({
  title,
  icon: Icon,
  toneCls,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  toneCls: string;
  children: React.ReactNode;
}) => (
  <div className={`rounded-xl border bg-surface-2/40 p-3.5 transition ${toneCls.split(" ").filter((c) => c.startsWith("border")).join(" ")}`}>
    <div className="mb-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneCls}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
    </div>
    {children}
  </div>
);

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 text-xs">
    <span className="text-muted-foreground">{label}</span>
    <span className="min-w-0 truncate font-medium">{value}</span>
  </div>
);

const Gauge = ({ value, min, max, range }: { value: number; min: number; max: number; range: [number, number] }) => {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const lo = ((range[0] - min) / (max - min)) * 100;
  const hi = ((range[1] - min) / (max - min)) * 100;
  const inRange = value >= range[0] && value <= range[1];

  return (
    <div className="mt-3">
      <div className="relative h-1.5 rounded-full bg-surface-3">
        <div
          className="absolute h-full rounded-full bg-success/20"
          style={{ left: `${lo}%`, width: `${hi - lo}%` }}
        />
        <motion.div
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className={`absolute h-full rounded-full ${inRange ? "bg-gradient-primary" : "bg-gradient-danger"}`}
        />
        <motion.div
          initial={false}
          animate={{ left: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className={`absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-full ${inRange ? "bg-primary" : "bg-destructive"} shadow-lg`}
        />
      </div>
    </div>
  );
};

const SpikeViz = ({ magnitude, alarm }: { magnitude: number; alarm: boolean }) => {
  // Build a fake waveform; spike center if alarm
  const points = Array.from({ length: 40 }, (_, i) => {
    const noise = Math.sin(i * 0.7) * 3 + Math.cos(i * 1.3) * 2;
    const spike = alarm && i > 22 && i < 28 ? (i === 25 ? magnitude * 0.6 : magnitude * 0.35) : 0;
    return 20 - noise - spike * 0.5;
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i / 39) * 100},${p}`).join(" ");

  return (
    <svg viewBox="0 0 100 40" className="mt-3 h-12 w-full" preserveAspectRatio="none">
      <path
        d={path}
        fill="none"
        stroke={alarm ? "hsl(var(--destructive))" : "hsl(var(--success))"}
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 2px ${alarm ? "hsl(var(--destructive))" : "hsl(var(--success))"})` }}
      />
    </svg>
  );
};
