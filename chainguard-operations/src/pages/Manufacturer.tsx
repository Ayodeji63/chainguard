import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseEventLogs } from "viem";
import { Navigate } from "react-router-dom";
import {
  Factory,
  Package,
  ShieldCheck,
  Hash,
  CheckCircle2,
  Zap,
  Truck,
} from "lucide-react";
import { RoleHeader } from "@/components/chainguard/RoleHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  SupplyChainSourceAbi,
  supplyChainAddress,
  supplyChainEscrowAbi,
  supplyChainEscrowAddress,
} from "../../contract.js";

interface MintedBatch {
  id: string;
  product: string;
  qty: number;
  origin: string;
  destination: string;
  txHash: string;
  rfid: string;
  ts: string;
  sealed: boolean;
}

const sample: MintedBatch[] = [
  {
    id: "BATCH-CG-2026-04821",
    product: "mRNA Vaccine",
    qty: 1200,
    origin: "Shenzhen, CN",
    destination: "Berlin, DE",
    txHash: "0x9f2a…cc18",
    rfid: "RFID-9F2A-77C1",
    ts: "2026-04-21 08:14 UTC",
    sealed: true,
  },
  {
    id: "BATCH-CG-2026-04820",
    product: "Insulin Pens",
    qty: 540,
    origin: "Shenzhen, CN",
    destination: "Lyon, FR",
    txHash: "0x71ba…40ef",
    rfid: "RFID-71BA-22D8",
    ts: "2026-04-20 11:02 UTC",
    sealed: true,
  },
];

const Manufacturer = () => {
  const { isConnected, address, chain } = useAccount();
  const publicClient = usePublicClient();
  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();

  const [batches, setBatches] = useState<MintedBatch[]>(sample);
  const [form, setForm] = useState({
    product: "",
    qty: "",
    destination: "",
    rfid: "",
    origin: "Shenzhen, CN",
    carrier: "0x3cfFEC3f8fdaE6Dff40A1CA2FbFc8dcF003669D4",
    wholesaler: "0x54509b12aB6Ad9D0F3590eD241980433ffCCFe2C",
    orderValue: "",
    carrierDeposit: "",
    carrierChainId: "11155420",
    wholesalerChainId: "84532",
  });
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<"idle" | "creating" | "ordering">("idle");

  useEffect(() => {
    if (step === "idle") {
      setProgress(0);
      return;
    }
    setProgress(0);
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return 90;
        return p + 8;
      });
    }, 90);
    return () => clearInterval(id);
  }, [step]);

  if (!isConnected) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !form.product ||
      !form.qty ||
      !form.destination ||
      !form.rfid ||
      !form.carrier ||
      !form.wholesaler ||
      !form.orderValue ||
      !form.carrierDeposit
    )
      return;

    const manufacturerChainId = 84532n;
    setStep("creating");

    try {
      // STEP 1 — Create item (contract auto-assigns ID)
      const txHash = await writeContractAsync({
        abi: SupplyChainSourceAbi,
        address: supplyChainAddress,
        functionName: "createItem",
        args: [form.rfid, form.origin],
        chain,
        account: address,
        gas: 400000,
      });

      // Wait for receipt
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });

      // Parse all events from this transaction using viem's parseEventLogs
      const logs = parseEventLogs({
        abi: SupplyChainSourceAbi,
        logs: receipt.logs,
      });

      // Find the ItemCreated event to retrieve the auto-generated id
      const itemCreatedLog = logs.find(
        (log) => log.eventName === "ItemCreated",
      );

      if (!itemCreatedLog) {
        throw new Error("ItemCreated event not found in transaction receipt");
      }

      const itemId = itemCreatedLog.args.id;

      // STEP 2 — Create escrow order using the retrieved item ID
      setStep("ordering");

      const orderTxHash = await writeContractAsync({
        abi: supplyChainEscrowAbi,
        address: supplyChainEscrowAddress,
        functionName: "createOrder",
        args: [
          itemId, // orderId = itemId
          itemId,
          form.carrier as `0x${string}`,
          BigInt(form.carrierChainId),
          form.wholesaler as `0x${string}`,
          BigInt(form.wholesalerChainId),
          manufacturerChainId,
          BigInt(form.orderValue),
          String(form.origin),
        ],
        chain,
        account: address,
        gas: 400000,
      });

      const newBatch: MintedBatch = {
        id: `BATCH-CG-2026-${String(itemId).padStart(5, "0")}`,
        product: form.product,
        qty: Number(form.qty),
        origin: form.origin,
        destination: form.destination,
        txHash: `${orderTxHash.slice(0, 6)}…${orderTxHash.slice(-4)}`,
        rfid: form.rfid,
        ts: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
        sealed: true,
      };
      setBatches((b) => [newBatch, ...b]);
      setForm({
        product: "",
        qty: "",
        destination: "",
        rfid: "",
        origin: "Shenzhen, CN",
        carrier: "0x3cfFEC3f8fdaE6Dff40A1CA2FbFc8dcF003669D4",
        wholesaler: "0x54509b12aB6Ad9D0F3590eD241980433ffCCFe2C",
        orderValue: "",
        carrierDeposit: "",
        carrierChainId: "11155420",
        wholesalerChainId: "84532",
      });
      setStep("idle");
      setProgress(100);
      toast({
        title: "Batch & Order sealed",
        description: `${newBatch.id} • escrow funded`,
      });
    } catch (err: any) {
      setStep("idle");
      console.log(err?.message);
      toast({
        title: "Transaction failed",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    }
  };

  const stats = useMemo(
    () => [
      {
        label: "Total Batches",
        value: batches.length,
        Icon: Package,
        accent: "text-primary",
      },
      {
        label: "Units Sealed",
        value: batches.reduce((a, b) => a + b.qty, 0).toLocaleString(),
        Icon: ShieldCheck,
        accent: "text-success",
      },
      { label: "Active Lines", value: 3, Icon: Factory, accent: "text-accent" },
      {
        label: "Avg Mint Time",
        value: "1.4s",
        Icon: Zap,
        accent: "text-warning",
      },
    ],
    [batches],
  );

  return (
    <div className="min-h-screen p-3 md:p-4">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3">
        <RoleHeader
          role="manufacturer"
          label="Manufacturer"
          subtitle="Production Floor Online"
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((s) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass flex items-center justify-between rounded-2xl p-4"
            >
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {s.value}
                </p>
              </div>
              <s.Icon className={`h-7 w-7 ${s.accent}`} strokeWidth={1.8} />
            </motion.div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-12">
          {/* Mint form */}
          <div className="glass-strong rounded-2xl p-5 lg:col-span-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Hash className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold">Mint New Batch</h2>
                <p className="text-[11px] text-muted-foreground">
                  Seal product custody + escrow on-chain
                </p>
              </div>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3">
              {/* Product */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="product"
                  className="text-[11px] uppercase tracking-wider text-muted-foreground"
                >
                  Product
                </Label>
                <Input
                  id="product"
                  placeholder="mRNA Vaccine"
                  value={form.product}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, product: e.target.value }))
                  }
                />
              </div>

              {/* Qty + Destination */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="qty"
                    className="text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    Quantity
                  </Label>
                  <Input
                    id="qty"
                    type="number"
                    placeholder="1200"
                    value={form.qty}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, qty: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="dest"
                    className="text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    Destination
                  </Label>
                  <Input
                    id="dest"
                    placeholder="Berlin, DE"
                    value={form.destination}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, destination: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* RFID + Origin */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="rfid"
                    className="text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    RFID Tag
                  </Label>
                  <Input
                    id="rfid"
                    placeholder="RFID-9F2A-77C1"
                    value={form.rfid}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, rfid: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="origin"
                    className="text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    Origin
                  </Label>
                  <Input
                    id="origin"
                    placeholder="Shenzhen, CN"
                    value={form.origin}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, origin: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Escrow header */}
              <div className="mt-1 flex items-center gap-2 border-t border-border/40 pt-3">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Escrow Order
                </span>
              </div>

              {/* Carrier + Wholesaler */}
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="carrier"
                    className="text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    Carrier Wallet
                  </Label>
                  <Input
                    id="carrier"
                    placeholder="0x8B71…Aa02"
                    value={form.carrier}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, carrier: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="wholesaler"
                    className="text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    Wholesaler Wallet
                  </Label>
                  <Input
                    id="wholesaler"
                    placeholder="0xA0Cf…251e"
                    value={form.wholesaler}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, wholesaler: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Order Value + Deposit */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="orderValue"
                    className="text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    Order Value (SCT)
                  </Label>
                  <Input
                    id="orderValue"
                    type="number"
                    placeholder="1000"
                    value={form.orderValue}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, orderValue: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="carrierDeposit"
                    className="text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    Carrier Deposit (SCT)
                  </Label>
                  <Input
                    id="carrierDeposit"
                    type="number"
                    placeholder="200"
                    value={form.carrierDeposit}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, carrierDeposit: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Chain IDs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="carrierChain"
                    className="text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    Carrier Chain ID
                  </Label>
                  <Input
                    id="carrierChain"
                    placeholder="84532"
                    value={form.carrierChainId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, carrierChainId: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="wholesalerChain"
                    className="text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    Wholesaler Chain ID
                  </Label>
                  <Input
                    id="wholesalerChain"
                    placeholder="84532"
                    value={form.wholesalerChainId}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        wholesalerChainId: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {step !== "idle" && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-primary">
                      {step === "creating"
                        ? "Creating item…"
                        : "Creating escrow…"}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {progress}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full bg-gradient-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={step !== "idle"}
                className="bg-gradient-primary text-primary-foreground hover:opacity-90"
              >
                {step !== "idle"
                  ? step === "creating"
                    ? "Minting Item…"
                    : "Funding Escrow…"
                  : "Seal Batch + Escrow"}
              </Button>
            </form>
          </div>

          {/* Recent batches */}
          <div className="glass-strong rounded-2xl p-5 lg:col-span-7">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold">Recently Minted</h2>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {batches.length} batches
              </span>
            </div>
            <div className="scrollbar-thin flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
              {batches.map((b) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface-2/60 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/15 text-success">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div className="leading-tight">
                      <p className="font-mono text-xs font-semibold">{b.id}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {b.product} • {b.qty.toLocaleString()} units →{" "}
                        {b.destination}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground md:text-right">
                    <span className="rounded border border-border/60 px-1.5 py-0.5">
                      {b.rfid}
                    </span>
                    <span className="rounded border border-primary/30 px-1.5 py-0.5 text-primary">
                      {b.txHash}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Manufacturer;
