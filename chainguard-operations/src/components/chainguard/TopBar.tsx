import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  Wallet,
  Coins,
  TrendingUp,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAccount, useBalance, useReadContract } from "wagmi";
import type { DemoState } from "@/lib/chainguard-data";
import { ConnectBar } from "./ConnectBar";
import { ThemeToggle } from "./ThemeToggle";
import {
  SupplyChainTokenAbi,
  supplyChainTokenAddress,
  supplyChainTokenAddress2,
} from "../../../contract.js";

interface TopBarProps {
  state: DemoState;
  now: Date;
}

const stateConfig = {
  normal: {
    label: "All Systems Normal",
    cls: "bg-success/15 text-success border-success/30",
    Icon: ShieldCheck,
    dot: "bg-success",
  },
  warning: {
    label: "Anomaly Detected",
    cls: "bg-warning/15 text-warning border-warning/30",
    Icon: ShieldAlert,
    dot: "bg-warning",
  },
  fraud: {
    label: "Fraud Detected",
    cls: "bg-destructive/15 text-destructive border-destructive/40",
    Icon: ShieldAlert,
    dot: "bg-destructive",
  },
} as const;

// Route-based role detection — works without hardcoded addresses
const getRoleFromPath = (
  pathname: string,
): { label: string; color: string; tokenAddress: `0x${string}` } | null => {
  if (pathname.includes("/manufacturer") || pathname === "/") {
    return {
      label: "MFG",
      color: "text-primary",
      tokenAddress: supplyChainTokenAddress,
    };
  }
  if (pathname.includes("/carrier")) {
    return {
      label: "CAR",
      color: "text-accent",
      tokenAddress: supplyChainTokenAddress,
    };
  }
  if (pathname.includes("/wholesaler")) {
    return {
      label: "WHL",
      color: "text-success",
      tokenAddress: supplyChainTokenAddress2,
    };
  }
  return null;
};

export const TopBar = ({ state, now }: TopBarProps) => {
  const cfg = stateConfig[state];
  const Icon = cfg.Icon;
  const { address, isConnected, chainId } = useAccount();
  const location = useLocation();

  const role = getRoleFromPath(location.pathname);

  // Fetch SCT token balance — uses different address for wholesaler (Optimism)
  const { data: tokenBalance, isError: tokenError } = useReadContract({
    address: role?.tokenAddress,
    abi: SupplyChainTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!role?.tokenAddress,
      refetchInterval: 10000, // Auto-refresh every 10s
    },
  });

  console.log(tokenBalance);

  // Fetch native gas balance
  const { data: ethBalance } = useBalance({
    address,
    query: {
      enabled: !!address,
      refetchInterval: 15000,
    },
  });

  const time = now.toLocaleTimeString("en-GB", { hour12: false });
  const date = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  // Format SCT with proper decimal handling (18 decimals)
  const formattedSCT = tokenBalance
    ? (Number(tokenBalance) / 1e18).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      })
    : isConnected && !!role
      ? "..."
      : "0.00";

  // Format ETH
  const formattedETH = ethBalance?.formatted
    ? parseFloat(ethBalance.formatted).toFixed(4)
    : "0.0000";

  const isWholesaler = role?.label === "WHL";

  return (
    <header className="glass-strong sticky top-0 z-30 flex h-16 items-center justify-between rounded-2xl px-5">
      <div className="flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
            <ShieldCheck
              className="h-5 w-5 text-primary-foreground"
              strokeWidth={2.5}
            />
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-bold tracking-tight">
              Chain<span className="text-gradient-primary">Guard</span>
            </h1>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Mission Control
            </p>
          </div>
        </Link>

        <div className="mx-1 h-8 w-px bg-border" />

        <motion.div
          key={state}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${cfg.cls}`}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${cfg.dot}`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${cfg.dot}`}
            />
          </span>
          <Icon className="h-3.5 w-3.5" />
          {cfg.label}
        </motion.div>
      </div>

      {/* ─────────────── BALANCES SECTION ─────────────── */}
      <div className="flex items-center gap-3">
        {isConnected && address && role && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-2/80 px-4 py-2"
          >
            {/* Role Badge */}
            <div
              className={`flex h-7 items-center justify-center rounded-md bg-surface-3 px-2.5 text-[10px] font-bold tracking-wider ${role.color}`}
            >
              {role.label}
            </div>

            <div className="h-6 w-px bg-border/60" />

            {/* SCT Balance */}
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/15">
                <Coins className="h-4 w-4 text-warning" />
              </div>
              <div className="leading-tight">
                <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                  {isWholesaler ? "SCT (Optimism)" : "SCT Balance"}
                </p>
                <p className="font-mono text-sm font-bold tabular-nums text-foreground">
                  {formattedSCT}{" "}
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    SCT
                  </span>
                </p>
              </div>
            </div>

            <div className="h-6 w-px bg-border/60" />

            {/* Native Balance */}
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <div className="leading-tight">
                <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                  {isWholesaler ? "ETH (Optimism)" : "Gas Balance"}
                </p>
                <p className="font-mono text-sm font-bold tabular-nums text-foreground">
                  {formattedETH}{" "}
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {ethBalance?.symbol ?? "ETH"}
                  </span>
                </p>
              </div>
            </div>

            <div className="h-6 w-px bg-border/60" />

            {/* Network / Status */}
            <div className="hidden items-center gap-2 lg:flex">
              <TrendingUp className="h-3.5 w-3.5 text-success" />
              <span className="text-[10px] font-semibold text-success">
                {chainId === 10 ? "OP Mainnet" : "L1"}
              </span>
            </div>
          </motion.div>
        )}

        {/* Not connected fallback */}
        {!isConnected && (
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-surface-2/40 px-3 py-1.5 text-[11px] text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Connect wallet to view balances
          </div>
        )}

        <div className="hidden items-center gap-2 rounded-lg border border-border/60 bg-surface-2/60 px-3 py-1.5 text-xs md:flex">
          <Activity className="h-3.5 w-3.5" />
          <span className="font-mono text-muted-foreground">{date}</span>
          <span className="font-mono font-semibold tabular-nums">{time}</span>
        </div>

        <ThemeToggle />
        <ConnectBar />
      </div>
    </header>
  );
};
