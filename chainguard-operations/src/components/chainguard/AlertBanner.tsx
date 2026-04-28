import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

interface AlertBannerProps {
  alert?: { title: string; message: string };
  variant: "warning" | "fraud";
}

export const AlertBanner = ({ alert, variant }: AlertBannerProps) => {
  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.98 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={`relative overflow-hidden rounded-2xl border ${
            variant === "fraud"
              ? "border-destructive/40 bg-destructive/10 shadow-danger animate-shake-loop"
              : "border-warning/40 bg-warning/10"
          }`}
        >
          {/* scanning sweep */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className={`absolute inset-y-0 w-1/3 animate-scan-sweep ${
                variant === "fraud" ? "bg-gradient-to-r from-transparent via-destructive/20 to-transparent" : "bg-gradient-to-r from-transparent via-warning/20 to-transparent"
              }`}
            />
          </div>

          <div className="relative flex items-center gap-4 px-5 py-3.5">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                variant === "fraud" ? "bg-destructive/20 text-destructive animate-pulse-ring" : "bg-warning/20 text-warning"
              }`}
            >
              <AlertTriangle className="h-5 w-5" strokeWidth={2.5} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-[10px] font-bold uppercase tracking-[0.2em] ${
                    variant === "fraud" ? "text-destructive" : "text-warning"
                  }`}
                >
                  {alert.title}
                </span>
                <span className="text-[10px] text-muted-foreground">• Triggered by Kwala automation</span>
              </div>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{alert.message}</p>
            </div>

            <button
              className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
