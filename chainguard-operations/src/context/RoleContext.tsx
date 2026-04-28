import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Role = "manufacturer" | "wholesaler" | "carrier";

export const ROLES: { id: Role; label: string; tagline: string; accent: string }[] = [
  { id: "manufacturer", label: "Manufacturer", tagline: "Mint batches & seal custody", accent: "primary" },
  { id: "carrier", label: "Carrier", tagline: "Monitor transit & sensors", accent: "accent" },
  { id: "wholesaler", label: "Wholesaler", tagline: "Receive & verify shipments", accent: "warning" },
];

interface RoleCtx {
  role: Role | null;
  setRole: (r: Role | null) => void;
}

const Ctx = createContext<RoleCtx | null>(null);
const KEY = "chainguard:role";

export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRoleState] = useState<Role | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(KEY);
    return v === "manufacturer" || v === "wholesaler" || v === "carrier" ? v : null;
  });

  const setRole = useCallback((r: Role | null) => {
    setRoleState(r);
    if (r) localStorage.setItem(KEY, r);
    else localStorage.removeItem(KEY);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        const v = e.newValue;
        setRoleState(v === "manufacturer" || v === "wholesaler" || v === "carrier" ? v : null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(() => ({ role, setRole }), [role, setRole]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useRole = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
};
