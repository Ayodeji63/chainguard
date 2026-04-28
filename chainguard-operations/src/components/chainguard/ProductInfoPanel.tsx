import { motion } from "framer-motion";
import { Package, MapPin, Flag, Snowflake, Truck, CheckCircle2 } from "lucide-react";
import type { ProductInfo, Checkpoint } from "@/lib/chainguard-data";

interface ProductInfoPanelProps {
  product: ProductInfo;
  selected: Checkpoint;
}

export const ProductInfoPanel = ({ product, selected }: ProductInfoPanelProps) => {
  const statusCfg = {
    "In Transit": { Icon: Truck, cls: "bg-accent/15 text-accent border-accent/30" },
    Delivered: { Icon: CheckCircle2, cls: "bg-success/15 text-success border-success/30" },
    Frozen: { Icon: Snowflake, cls: "bg-destructive/15 text-destructive border-destructive/40" },
  } as const;

  const cfg = statusCfg[product.shipmentStatus];
  const StatusIcon = cfg.Icon;

  return (
    <div className="glass flex flex-col gap-4 rounded-2xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Active Batch</p>
          <h2 className="mt-0.5 font-mono text-sm font-bold tracking-tight">{product.batchId}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{product.product}</p>
        </div>
        <motion.div
          key={product.shipmentStatus}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${cfg.cls}`}
        >
          <StatusIcon className="h-3 w-3" />
          {product.shipmentStatus}
        </motion.div>
      </div>

      {/* progress bar */}
      <div>
        <div className="mb-1.5 flex justify-between font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{product.origin}</span>
          <span className="flex items-center gap-1"><Flag className="h-2.5 w-2.5" />{product.destination}</span>
        </div>
        <div className="relative h-2 rounded-full bg-surface-3 overflow-hidden">
          <motion.div
            initial={false}
            animate={{ width: `${product.progress}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className={`h-full rounded-full ${
              product.shipmentStatus === "Frozen"
                ? "bg-gradient-danger"
                : "bg-gradient-primary"
            }`}
          />
        </div>
        <div className="mt-1 text-right font-mono text-[10px] text-muted-foreground">
          {product.progress}% · ETA 2026-04-24 18:30 UTC
        </div>
      </div>

      {/* selected checkpoint detail */}
      <div className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Package className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Selected Checkpoint
          </span>
        </div>
        <p className="text-sm font-semibold">{selected.name}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <Detail label="Timestamp" value={selected.timestamp} mono />
          <Detail label="Actor" value={selected.actor} />
          <Detail label="Wallet" value={selected.wallet} mono />
          <Detail
            label="Scan"
            value={
              <span
                className={`font-bold ${
                  selected.scanStatus === "Valid"
                    ? "text-success"
                    : selected.scanStatus === "Unauthorized"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {selected.scanStatus}
              </span>
            }
          />
        </div>
      </div>
    </div>
  );
};

const Detail = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => (
  <div className="min-w-0">
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`truncate ${mono ? "font-mono" : ""} text-foreground`}>{value}</p>
  </div>
);
