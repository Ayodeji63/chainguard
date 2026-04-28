import { motion } from "framer-motion";
import { Package, Truck, ScanLine, Thermometer, AlertTriangle, ShieldCheck } from "lucide-react";
import type { TimelineEvent } from "@/lib/chainguard-data";

const iconMap = {
  package: Package,
  truck: Truck,
  scan: ScanLine,
  thermo: Thermometer,
  alert: AlertTriangle,
  shield: ShieldCheck,
} as const;

const statusCls = {
  info: "border-accent/40 bg-accent/10 text-accent",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-destructive/50 bg-destructive/15 text-destructive",
} as const;

interface EventTimelineProps {
  events: TimelineEvent[];
}

export const EventTimeline = ({ events }: EventTimelineProps) => {
  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Event Timeline</h2>
          <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {events.length} events
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          On-chain · Verified
        </span>
      </div>

      <div className="relative flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
        {/* timeline rail */}
        <div className="absolute left-[34px] top-4 bottom-4 w-px bg-gradient-to-b from-border via-border to-transparent" />

        <ul className="space-y-3">
          {events.map((e, i) => {
            const Icon = iconMap[e.icon];
            return (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                className="relative flex items-start gap-3"
              >
                <div
                  className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${statusCls[e.status]} ${
                    e.status === "danger" ? "animate-pulse-ring" : ""
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.4} />
                </div>

                <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2 transition hover:border-border hover:bg-surface-2/70">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold ${e.status === "danger" ? "text-destructive" : "text-foreground"}`}>
                      {e.title}
                    </p>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{e.timestamp}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{e.location}</span>
                    <span className="text-border">•</span>
                    <span className="font-mono">{e.actor}</span>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
