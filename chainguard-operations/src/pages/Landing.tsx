import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useNavigate } from "react-router-dom";
import { Factory, Truck, Warehouse, ShieldCheck, ArrowRight, Wallet, Beaker } from "lucide-react";
import { ROLES, useRole, type Role } from "@/context/RoleContext";
import { ThemeToggle } from "@/components/chainguard/ThemeToggle";

const icons: Record<Role, typeof Factory> = {
  manufacturer: Factory,
  carrier: Truck,
  wholesaler: Warehouse,
};

const accent: Record<Role, { ring: string; grad: string; text: string }> = {
  manufacturer: { ring: "hover:border-primary/60", grad: "from-primary/20 to-primary/0", text: "text-primary" },
  carrier: { ring: "hover:border-accent/60", grad: "from-accent/20 to-accent/0", text: "text-accent" },
  wholesaler: { ring: "hover:border-warning/60", grad: "from-warning/20 to-warning/0", text: "text-warning" },
};

const Landing = () => {
  const { isConnected } = useAccount();
  const { setRole } = useRole();
  const navigate = useNavigate();

  const enter = (r: Role) => {
    setRole(r);
    navigate(`/${r}`);
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <ShieldCheck className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <h1 className="text-lg font-bold tracking-tight">
                Chain<span className="text-gradient-primary">Guard</span>
              </h1>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Mission Control
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ConnectButton showBalance={false} />
          </div>
        </header>

        <section className="flex flex-col items-center gap-3 pt-6 text-center">
          <span className="rounded-full border border-border/60 bg-surface-2/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Blockchain-secured supply chain
          </span>
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            Choose your <span className="text-gradient-primary">operating role</span>
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground md:text-base">
            Connect a wallet to authenticate as a stakeholder. Each role has a tailored
            console for their phase of the supply chain.
          </p>
        </section>

        {!isConnected && (
          <div className="glass mx-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3">
            <Wallet className="h-4 w-4 text-accent" />
            <p className="text-xs text-muted-foreground">
              Connect your wallet first to unlock the role consoles.
            </p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {ROLES.map((r, i) => {
            const Icon = icons[r.id];
            const a = accent[r.id];
            const disabled = !isConnected;
            return (
              <motion.button
                key={r.id}
                type="button"
                disabled={disabled}
                onClick={() => enter(r.id)}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                whileHover={disabled ? {} : { y: -4 }}
                className={`glass group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border/60 p-6 text-left transition-colors ${a.ring} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              >
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.grad} opacity-0 transition-opacity group-hover:opacity-100`}
                />
                <div className="relative flex items-start justify-between">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 ${a.text}`}>
                    <Icon className="h-6 w-6" strokeWidth={2} />
                  </div>
                  <span className="rounded-full border border-border/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Phase {i + 1}
                  </span>
                </div>
                <div className="relative">
                  <h3 className="text-xl font-bold tracking-tight">{r.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{r.tagline}</p>
                </div>
                <div className={`relative mt-auto flex items-center gap-1.5 text-xs font-semibold ${a.text}`}>
                  Open console
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </motion.button>
            );
          })}
        </div>

        <footer className="flex flex-col items-center gap-2 pt-8 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <button
            type="button"
            onClick={() => navigate("/playground")}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface-2/60 px-3 py-1 text-foreground/80 transition hover:border-foreground/40 hover:text-foreground"
          >
            <Beaker className="h-3 w-3" /> Open Sensor Playground
          </button>
          <span>ChainGuard v1.0 · Powered by Kwala Automation</span>
        </footer>
      </div>
    </div>
  );
};

export default Landing;
