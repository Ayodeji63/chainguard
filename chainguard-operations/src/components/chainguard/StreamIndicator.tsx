import { motion, AnimatePresence } from "framer-motion";
import { Radio } from "lucide-react";
import type { StreamPacket } from "@/hooks/useTelemetryStream";

interface Props {
  connected: boolean;
  latencyMs: number;
  lastPacket?: StreamPacket;
}

const levelCls = {
  info: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
} as const;

export const StreamIndicator = ({ connected, latencyMs, lastPacket }: Props) => {
  return (
    <div className="glass flex items-center gap-2.5 rounded-xl border border-border/60 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          {connected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              connected ? "bg-success" : "bg-muted-foreground"
            }`}
          />
        </span>
        <Radio className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {connected ? "WSS · Live" : "Connecting"}
        </span>
      </div>

      <span className="font-mono text-[10px] text-muted-foreground">
        {latencyMs}ms
      </span>

      <div className="hidden min-w-0 max-w-[260px] items-center gap-1.5 overflow-hidden md:flex">
        <span className="text-border">│</span>
        <AnimatePresence mode="wait">
          {lastPacket && (
            <motion.span
              key={lastPacket.id}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              className={`truncate font-mono text-[10px] ${levelCls[lastPacket.level]}`}
            >
              [{lastPacket.channel}] {lastPacket.message}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
