import { motion, AnimatePresence } from "framer-motion";
import { Play, Square, History } from "lucide-react";

interface ReplayControlProps {
  playing: boolean;
  stepIdx: number;
  totalSteps: number;
  currentLabel: string | null;
  onPlay: () => void;
  onStop: () => void;
}

export const ReplayControl = ({
  playing,
  stepIdx,
  totalSteps,
  currentLabel,
  onPlay,
  onStop,
}: ReplayControlProps) => {
  const progress = playing && stepIdx >= 0 ? ((stepIdx + 1) / totalSteps) * 100 : 0;

  return (
    <div className="glass flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <History className="h-3.5 w-3.5 text-accent" />
        Anomaly Replay
      </div>

      <button
        onClick={playing ? onStop : onPlay}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
          playing
            ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
            : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
        }`}
      >
        {playing ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        {playing ? "Stop" : "Replay"}
      </button>

      <div className="relative hidden h-1.5 w-32 overflow-hidden rounded-full bg-surface-2 sm:block">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-warning to-destructive"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      <AnimatePresence mode="wait">
        {currentLabel && (
          <motion.span
            key={currentLabel}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="hidden font-mono text-[10px] text-muted-foreground md:inline"
          >
            {currentLabel}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};
