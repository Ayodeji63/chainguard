import type { DemoState } from "@/lib/chainguard-data";
import { CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";

interface DemoStateSwitcherProps {
  state: DemoState;
  onChange: (s: DemoState) => void;
}

const options: { value: DemoState; label: string; Icon: React.ComponentType<{ className?: string }>; activeCls: string }[] = [
  { value: "normal", label: "Normal", Icon: CheckCircle2, activeCls: "bg-success/20 text-success border-success/40 shadow-glow" },
  { value: "warning", label: "Warning", Icon: AlertTriangle, activeCls: "bg-warning/20 text-warning border-warning/40" },
  { value: "fraud", label: "Fraud", Icon: ShieldAlert, activeCls: "bg-destructive/20 text-destructive border-destructive/50 shadow-danger" },
];

export const DemoStateSwitcher = ({ state, onChange }: DemoStateSwitcherProps) => {
  return (
    <div className="glass flex items-center gap-1 rounded-2xl p-1.5">
      <span className="px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Demo
      </span>
      {options.map(({ value, label, Icon, activeCls }) => {
        const active = state === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              active
                ? activeCls
                : "border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
};
