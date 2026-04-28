import { motion } from "framer-motion";
import { Factory, Warehouse, Truck, Store, MapPin } from "lucide-react";
import type { Checkpoint, DemoState } from "@/lib/chainguard-data";

interface ShipmentMapProps {
  checkpoints: Checkpoint[];
  selectedId: string;
  onSelect: (id: string) => void;
  state: DemoState;
}

const iconFor = (type: Checkpoint["type"]) => {
  switch (type) {
    case "factory": return Factory;
    case "warehouse": return Warehouse;
    case "transit": return Truck;
    case "retailer": return Store;
  }
};

export const ShipmentMap = ({ checkpoints, selectedId, onSelect, state }: ShipmentMapProps) => {
  // Build polyline from checkpoint coordinates (percent space)
  const pathPoints = checkpoints.map((c) => `${c.x},${c.y}`).join(" ");

  // Find current position based on which checkpoint is "current" or last completed
  const currentIdx = checkpoints.findIndex((c) => c.status === "current" || c.status === "anomaly");
  const truckPos = currentIdx >= 0 ? checkpoints[currentIdx] : checkpoints[0];

  return (
    <div className="glass relative flex h-full flex-col overflow-hidden rounded-2xl">
      {/* header */}
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-tight">Live Shipment Route</h2>
          <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            BATCH-CG-2026-04821
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <Legend color="bg-success" label="Completed" />
          <Legend color="bg-accent" label="Current" pulse />
          <Legend color="bg-muted-foreground" label="Pending" />
          {state === "fraud" && <Legend color="bg-destructive" label="Anomaly" pulse />}
        </div>
      </div>

      {/* map canvas */}
      <div className="relative flex-1 overflow-hidden grid-bg">
        {/* faint world silhouette */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-glow" />
        <svg
          viewBox="0 0 100 70"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {/* stylized continent shapes */}
          <g fill="hsl(var(--surface-3))" opacity="0.55">
            <path d="M5,55 Q12,42 22,46 Q30,50 28,60 Q22,68 12,66 Q4,64 5,55Z" />
            <path d="M30,48 Q42,38 55,40 Q68,42 78,32 Q88,24 92,18 Q95,28 86,38 Q72,52 58,52 Q44,54 36,58 Q30,55 30,48Z" />
            <path d="M62,52 Q72,55 78,62 Q72,66 64,62 Q58,58 62,52Z" />
          </g>

          {/* graticule */}
          <g stroke="hsl(var(--border))" strokeWidth="0.08" opacity="0.5">
            {[10, 20, 30, 40, 50, 60].map((y) => (
              <line key={y} x1="0" x2="100" y1={y} y2={y} />
            ))}
            {[20, 40, 60, 80].map((x) => (
              <line key={x} x1={x} x2={x} y1="0" y2="70" />
            ))}
          </g>

          {/* completed route */}
          <polyline
            points={pathPoints}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="0.45"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
            style={{ filter: "drop-shadow(0 0 1.5px hsl(var(--primary) / 0.6))" }}
          />
          {/* upcoming dashed segment */}
          <polyline
            points={checkpoints.slice(currentIdx >= 0 ? currentIdx : 0).map((c) => `${c.x},${c.y}`).join(" ")}
            fill="none"
            stroke="hsl(var(--accent))"
            strokeWidth="0.45"
            strokeLinecap="round"
            strokeDasharray="1.2 1.2"
            className="animate-marquee-dash"
            opacity="0.85"
          />
        </svg>

        {/* checkpoints (HTML overlay so we can interact easily) */}
        {checkpoints.map((cp) => {
          const Icon = iconFor(cp.type);
          const isSelected = cp.id === selectedId;
          const isAnomaly = cp.status === "anomaly";
          const isCurrent = cp.status === "current";
          const isCompleted = cp.status === "completed";

          const colorCls = isAnomaly
            ? "bg-destructive text-destructive-foreground border-destructive shadow-danger"
            : isCurrent
            ? "bg-accent text-accent-foreground border-accent shadow-glow"
            : isCompleted
            ? "bg-success text-success-foreground border-success/60"
            : "bg-surface-2 text-muted-foreground border-border";

          return (
            <button
              key={cp.id}
              onClick={() => onSelect(cp.id)}
              style={{ left: `${cp.x}%`, top: `${cp.y}%` }}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
            >
              {/* pulse rings for active/anomaly */}
              {(isCurrent || isAnomaly) && (
                <span
                  className={`absolute left-1/2 top-1/2 -z-10 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                    isAnomaly ? "bg-destructive/30" : "bg-accent/30"
                  } animate-ping`}
                />
              )}

              <div
                className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300 ${colorCls} ${
                  isSelected ? "scale-125 ring-2 ring-foreground/30 ring-offset-2 ring-offset-background" : "hover:scale-110"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2.5} />
              </div>

              {/* label */}
              <div
                className={`pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
                  isSelected
                    ? "border-foreground/20 bg-surface-1 text-foreground opacity-100"
                    : "border-border/60 bg-surface-1/80 text-muted-foreground opacity-0 group-hover:opacity-100"
                }`}
              >
                {cp.name}
              </div>
            </button>
          );
        })}

        {/* moving truck dot at current position */}
        {truckPos && state !== "fraud" && (
          <motion.div
            initial={false}
            animate={{ left: `${truckPos.x}%`, top: `${truckPos.y}%` }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
          >
            <div className="relative animate-float">
              <div className="absolute inset-0 -m-3 rounded-full bg-accent/30 blur-md" />
              <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-gradient-primary shadow-glow ring-2 ring-background">
                <Truck className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
              </div>
            </div>
          </motion.div>
        )}

        {/* corner overlay readouts */}
        <div className="pointer-events-none absolute left-4 top-4 space-y-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <div>LAT 51.92° N · LON 4.48° E</div>
          <div className="text-primary">SIG · LIVE TELEMETRY</div>
        </div>
        <div className="pointer-events-none absolute bottom-4 right-4 rounded-md border border-border/60 bg-surface-1/80 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur">
          ZOOM · GLOBAL
        </div>
      </div>
    </div>
  );
};

const Legend = ({ color, label, pulse }: { color: string; label: string; pulse?: boolean }) => (
  <div className="flex items-center gap-1.5">
    <span className={`relative flex h-2 w-2 rounded-full ${color}`}>
      {pulse && <span className={`absolute inset-0 animate-ping rounded-full ${color} opacity-60`} />}
    </span>
    <span>{label}</span>
  </div>
);
