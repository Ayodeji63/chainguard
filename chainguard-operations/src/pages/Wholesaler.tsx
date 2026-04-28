import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAccount, useWriteContract } from "wagmi";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { Navigate } from "react-router-dom";
import {
  Warehouse,
  PackageCheck,
  Clock,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  Wallet,
  Truck,
  HandCoins,
  AlertCircle,
  CircleDollarSign,
} from "lucide-react";
import { RoleHeader } from "@/components/chainguard/RoleHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  SupplyChainSourceAbi,
  SupplyChainTokenAbi,
  supplyChainAddress,
  supplyChainEscrowAbi,
  supplyChainEscrowAddress,
  supplyChainTokenAddress,
  supplyChainTokenAddress2,
} from "../../contract.js";

// ------------------------------------------------------------------
// Dedicated Base public client — used exclusively for reading.
// This is chain-agnostic: it always reads from Base regardless of
// which network the user's wallet is currently connected to.
// ------------------------------------------------------------------
const basePublicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
interface OnChainItem {
  id: bigint;
  manufacturer: `0x${string}`;
  currentCustodian: `0x${string}`;
  status: number;
  exists: boolean;
  lastLocation: string;
  lastScanTime: bigint;
  lastScanner: `0x${string}`;
  scanCount: bigint;
  windowStart: bigint;
  lastReading: {
    temperature: bigint;
    humidity: bigint;
    tiltDetected: boolean;
    timestamp: bigint;
  };
  rfidTag: string;
}

interface EscrowOrder {
  orderId: bigint;
  itemId: bigint;
  manufacturer: { wallet: `0x${string}`; chainId: bigint };
  carrier: { wallet: `0x${string}`; chainId: bigint };
  wholesaler: { wallet: `0x${string}`; chainId: bigint };
  orderValue: bigint;
  carrierDeposit: bigint;
  status: number;
  liableParty: number;
  exists: boolean;
  createdAt: bigint;
  pickedUpAt: bigint;
  deliveredAt: bigint;
  breachReason: string;
}

interface IncomingShipment {
  id: string;
  product: string;
  qty: number;
  origin: string;
  carrier: string;
  eta: string;
  integrity: "verified" | "warning" | "compromised";
  custody: string;
  order: EscrowOrder | null;
  item: OnChainItem;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
const formatAddress = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

const formatBatchId = (id: bigint) =>
  `BATCH-CG-2026-${String(id).padStart(5, "0")}`;

// Contract enum OrderStatus:
// 0=Created, 1=Funded, 2=CarrierReady, 3=InTransit, 4=Delivered, 5=Disputed, 6=Resolved
const ESCROW_STATUS_META: Record<
  number,
  {
    label: string;
    color: string;
    bg: string;
    border: string;
    icon: React.ElementType;
  }
> = {
  0: {
    label: "Created",
    color: "text-muted-foreground",
    bg: "bg-muted/20",
    border: "border-border/40",
    icon: Clock,
  },
  1: {
    label: "Funded — Awaiting Pickup",
    color: "text-primary",
    bg: "bg-primary/15",
    border: "border-primary/30",
    icon: Wallet,
  },
  2: {
    label: "Carrier Ready — Awaiting Funds",
    color: "text-warning",
    bg: "bg-warning/15",
    border: "border-warning/30",
    icon: HandCoins,
  },
  3: {
    label: "In Transit",
    color: "text-accent",
    bg: "bg-accent/15",
    border: "border-accent/30",
    icon: Truck,
  },
  4: {
    label: "Delivered",
    color: "text-success",
    bg: "bg-success/15",
    border: "border-success/30",
    icon: CheckCircle2,
  },
  5: {
    label: "Disputed",
    color: "text-destructive",
    bg: "bg-destructive/15",
    border: "border-destructive/40",
    icon: AlertCircle,
  },
  6: {
    label: "Resolved",
    color: "text-success",
    bg: "bg-success/15",
    border: "border-success/30",
    icon: CheckCircle2,
  },
};

const mapItemIntegrity = (item: OnChainItem): IncomingShipment["integrity"] => {
  const temp = Number(item.lastReading.temperature);
  const humidity = Number(item.lastReading.humidity);
  const tilt = item.lastReading.tiltDetected;

  if (item.status === 1) return "compromised"; // Flagged
  if (temp > 80 || humidity > 70 || tilt) return "warning";
  return "verified";
};

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------
const Wholesaler = () => {
  const { isConnected, address, chain } = useAccount();
  const { toast } = useToast();
  const { writeContract, isPending: isWriting } = useWriteContract();

  const [shipments, setShipments] = useState<IncomingShipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "mine" | "fund" | "transit">(
    "all",
  );

  // ----------------------------------------------------------------
  // Fetch items + escrow orders
  // Always reads from Base via the dedicated basePublicClient,
  // regardless of which chain the wallet is on.
  // ----------------------------------------------------------------
  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        const count = await basePublicClient.readContract({
          address: supplyChainAddress,
          abi: SupplyChainSourceAbi,
          functionName: "itemCounter",
          authorizationList: undefined,
        });

        const total = Number(count);
        if (total === 0) {
          setShipments([]);
          setIsLoading(false);
          return;
        }

        const ids = Array.from({ length: total }, (_, i) => BigInt(i + 1));

        const itemResults = await basePublicClient.multicall({
          contracts: ids.map((id) => ({
            address: supplyChainAddress,
            abi: SupplyChainSourceAbi,
            functionName: "getItem",
            args: [id],
          })),
          authorizationList: undefined,
        });

        const orderResults = await basePublicClient.multicall({
          contracts: ids.map((id) => ({
            address: supplyChainEscrowAddress,
            abi: supplyChainEscrowAbi,
            functionName: "getOrderByItem",
            args: [id],
          })),
          authorizationList: undefined,
        });

        const mapped: IncomingShipment[] = [];
        for (let i = 0; i < ids.length; i++) {
          const itemRes = itemResults[i];
          const orderRes = orderResults[i];

          if (itemRes.status !== "success" || !itemRes.result) continue;

          const item = itemRes.result as unknown as OnChainItem;
          let order: EscrowOrder | null = null;

          if (orderRes.status === "success" && orderRes.result) {
            const raw = orderRes.result as any;
            order = {
              orderId: raw.orderId,
              itemId: raw.itemId,
              manufacturer: raw.manufacturer,
              carrier: raw.carrier,
              wholesaler: raw.wholesaler,
              orderValue: raw.orderValue,
              carrierDeposit: raw.carrierDeposit,
              status: Number(raw.status),
              liableParty: Number(raw.liableParty),
              exists: raw.exists,
              createdAt: raw.createdAt,
              pickedUpAt: raw.pickedUpAt,
              deliveredAt: raw.deliveredAt,
              breachReason: raw.breachReason,
            };
          }

          mapped.push({
            id: formatBatchId(ids[i]),
            product: item.rfidTag || `Item #${ids[i]}`,
            qty: 0,
            origin: item.lastLocation || "Unknown",
            carrier: formatAddress(item.currentCustodian),
            eta: item.lastScanTime
              ? new Date(Number(item.lastScanTime) * 1000)
                  .toISOString()
                  .slice(0, 16)
                  .replace("T", " ")
              : "Pending",
            integrity: mapItemIntegrity(item),
            custody: formatAddress(item.currentCustodian),
            order,
            item,
          });
        }

        setShipments(mapped);
      } catch (err) {
        console.error(err);
        toast({
          title: "Failed to load shipments",
          description: "Could not fetch on-chain data.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
    // No dependency on publicClient or chain — always reads from Base
  }, [toast]);

  // ----------------------------------------------------------------
  // Derived lists
  // ----------------------------------------------------------------
  const isMyOrder = (s: IncomingShipment) =>
    s.order?.wholesaler.wallet.toLowerCase() === address?.toLowerCase();

  const myOrders = shipments.filter(isMyOrder);

  const needsFunding = myOrders.filter((s) => s.order?.status === 2);
  const inTransit = myOrders.filter((s) => s.order?.status === 3);

  const visibleShipments = useMemo(() => {
    if (filter === "mine") return myOrders;
    if (filter === "fund") return needsFunding;
    if (filter === "transit") return inTransit;
    return shipments;
  }, [shipments, myOrders, needsFunding, inTransit, filter]);

  // ----------------------------------------------------------------
  // Stats
  // ----------------------------------------------------------------
  const stats = useMemo(() => {
    const incoming = shipments.filter(
      (s) => s.item.status === 0 || s.item.status === 2,
    ).length;
    const delivered = shipments.filter((s) => s.item.status === 3).length;
    const flagged = shipments.filter((s) => s.item.status === 1).length;
    return [
      {
        label: "Incoming",
        value: incoming,
        Icon: Clock,
        accent: "text-accent",
      },
      {
        label: "Delivered",
        value: delivered,
        Icon: PackageCheck,
        accent: "text-success",
      },
      {
        label: "Flagged",
        value: flagged,
        Icon: XCircle,
        accent: "text-destructive",
      },
      {
        label: "Needs Funding",
        value: needsFunding.length,
        Icon: CircleDollarSign,
        accent: "text-warning",
      },
    ];
  }, [shipments, needsFunding.length]);

  if (!isConnected) return <Navigate to="/" replace />;

  // ----------------------------------------------------------------
  // Actions — writes go to whatever chain the wallet is on (Op Sepolia)
  // ----------------------------------------------------------------
  const fundEscrow = (orderId: bigint, amount: bigint) => {
    setPendingId(`fund-${orderId}`);

    // writeContract(
    //   {
    //     abi: SupplyChainTokenAbi,
    //     address: supplyChainTokenAddress2,
    //     functionName: "approve",
    //     args: [supplyChainEscrowAddress, BigInt(10 ** 18)],
    //     chain: chain,
    //     account: address,
    //     gas: 500000n,
    //   },
    //   {
    //     onSuccess: () => {
    //       toast({
    //         title: "Approval successful",
    //         description: "Proceeding to deposit bond in escrow.",
    //       });
    //     },
    //     onError: (err) => console.log(err),
    //   },
    // );
    writeContract(
      {
        abi: SupplyChainTokenAbi,
        address: supplyChainTokenAddress2,
        functionName: "fundEscrowCrossChain",
        args: [orderId, amount, BigInt(84532)],
        chain,
        account: address,
        gas: 700000n,
      },
      {
        onSuccess: () => {
          setPendingId(null);
          toast({
            title: "Escrow funded",
            description: `Order #${orderId} locked in escrow.`,
          });
        },
        onError: (err: any) => {
          setPendingId(null);
          toast({
            title: "Funding failed",
            description: err.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const confirmDelivery = (orderId: bigint) => {
    setPendingId(`deliver-${orderId}`);
    writeContract(
      {
        abi: supplyChainEscrowAbi,
        address: supplyChainEscrowAddress,
        functionName: "confirmDelivery",
        args: [orderId],
        chain,
        account: address,
        gas: 400000n,
      },
      {
        onSuccess: () => {
          setPendingId(null);
          toast({
            title: "Delivery confirmed",
            description: `Order #${orderId} completed. Funds released.`,
          });
        },
        onError: (err: any) => {
          setPendingId(null);
          toast({
            title: "Confirmation failed",
            description: err.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const isActing = (action: string, id: string | bigint) =>
    pendingId === `${action}-${id}`;

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  return (
    <div className="min-h-screen p-3 md:p-4">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3">
        <RoleHeader
          role="wholesaler"
          label="Wholesaler"
          subtitle="Receiving Bay Active"
        />

        {/* Stats */}
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

        {/* Filters */}
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3">
          {(
            [
              { key: "all", label: "All Shipments" },
              { key: "mine", label: "My Orders" },
              { key: "fund", label: `Needs Funding (${needsFunding.length})` },
              { key: "transit", label: `In Transit (${inTransit.length})` },
            ] as const
          ).map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key as typeof filter)}
              className="text-[11px] uppercase tracking-wider"
            >
              {f.label}
            </Button>
          ))}
        </div>

        {/* Shipments */}
        <div className="glass-strong rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold">Inbound Shipments</h2>
              <p className="text-[11px] text-muted-foreground">
                Verify chain integrity and manage escrow orders
              </p>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {isLoading ? "Loading…" : `${visibleShipments.length} shown`}
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Fetching on-chain data…
            </div>
          ) : visibleShipments.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No items match the current filter.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleShipments.map((s) => {
                const isMine = isMyOrder(s);
                const escrowMeta = s.order
                  ? (ESCROW_STATUS_META[s.order.status] ??
                    ESCROW_STATUS_META[0])
                  : null;

                let integrityCls = "";
                let IntegrityIcon = ShieldCheck;
                let integrityLabel = "Chain Verified";

                if (s.integrity === "compromised") {
                  integrityCls =
                    "bg-destructive/15 text-destructive border-destructive/40";
                  IntegrityIcon = ShieldAlert;
                  integrityLabel = "Integrity Breach";
                } else if (s.integrity === "warning") {
                  integrityCls = "bg-warning/15 text-warning border-warning/30";
                  IntegrityIcon = ShieldAlert;
                  integrityLabel = "Cold-chain Warning";
                } else {
                  integrityCls = "bg-success/15 text-success border-success/30";
                }

                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-3 rounded-xl border border-border/60 bg-surface-2/60 p-4 md:flex-row md:items-start md:justify-between"
                  >
                    {/* Left: Item info */}
                    <div className="flex flex-1 items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15 text-warning">
                        <Warehouse className="h-5 w-5" />
                      </div>
                      <div className="leading-tight">
                        <p className="font-mono text-xs font-semibold">
                          {s.id}
                        </p>
                        <p className="mt-0.5 text-sm">{s.product}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          From {s.origin} • Carrier{" "}
                          <span className="font-mono">{s.carrier}</span> • Last
                          scan {s.eta}
                        </p>

                        {/* Escrow info panel */}
                        {s.order && escrowMeta && (
                          <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-border/50 bg-surface-3/40 p-2.5">
                            <div className="flex items-center gap-2">
                              <escrowMeta.icon
                                className={`h-3.5 w-3.5 ${escrowMeta.color}`}
                              />
                              <span
                                className={`text-[11px] font-semibold ${escrowMeta.color}`}
                              >
                                Escrow: {escrowMeta.label}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-3 font-mono text-[10px] text-muted-foreground">
                              <span>
                                Order Value:{" "}
                                <span className="text-foreground">
                                  {s.order.orderValue.toString()} SCT
                                </span>
                              </span>
                              <span>
                                Carrier Bond:{" "}
                                <span className="text-foreground">
                                  {s.order.carrierDeposit.toString()} SCT
                                </span>
                              </span>
                              <span>
                                Manufacturer:{" "}
                                {formatAddress(s.order.manufacturer.wallet)}
                              </span>
                              <span>
                                Carrier: {formatAddress(s.order.carrier.wallet)}
                              </span>
                            </div>
                          </div>
                        )}

                        {!s.order && (
                          <p className="mt-1 text-[11px] text-destructive">
                            No escrow order found for this item.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Badges + Escrow Actions */}
                    <div className="flex flex-col items-stretch gap-2 md:items-end md:pt-1">
                      {/* Integrity badge */}
                      <span
                        className={`inline-flex items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11px] font-semibold md:self-end ${integrityCls}`}
                      >
                        <IntegrityIcon className="h-3 w-3" />
                        {integrityLabel}
                      </span>

                      {/* Assignment badge */}
                      {isMine && (
                        <span className="inline-flex items-center gap-1.5 self-start rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent md:self-end">
                          <Wallet className="h-3 w-3" />
                          You are wholesaler
                        </span>
                      )}

                      {/* Escrow actions */}
                      {isMine && s.order && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {/* Status 2 = CarrierReady → Fund Escrow */}
                          {s.order.status === 1 && (
                            <Button
                              size="sm"
                              disabled={isWriting}
                              onClick={() =>
                                fundEscrow(s.order!.orderId, s.order.orderValue)
                              }
                              className="gap-1.5 bg-warning text-warning-foreground hover:bg-warning/90"
                            >
                              <CircleDollarSign className="h-3.5 w-3.5" />
                              {isActing("fund", s.order.orderId)
                                ? "Funding…"
                                : `Fund Escrow (${s.order.orderValue.toString()} SCT)`}
                            </Button>
                          )}

                          {/* Status 1 = Funded → waiting for carrier pickup */}
                          {s.order.status === 2 && (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] text-primary">
                              <Clock className="h-3 w-3" />
                              Funded — awaiting carrier pickup
                            </span>
                          )}

                          {/* Status 0 = Created → waiting for carrier bond */}
                          {s.order.status === 0 && (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Awaiting carrier bond
                            </span>
                          )}

                          {/* Status 3 = InTransit → Confirm Delivery */}
                          {s.order.status === 3 && (
                            <Button
                              size="sm"
                              disabled={isWriting}
                              onClick={() => confirmDelivery(s.order!.orderId)}
                              className="gap-1.5 bg-success text-success-foreground hover:bg-success/90"
                            >
                              <Truck className="h-3.5 w-3.5" />
                              {isActing("deliver", s.order.orderId)
                                ? "Confirming…"
                                : "Confirm Delivery"}
                            </Button>
                          )}

                          {/* Status 4+ = Done */}
                          {s.order.status >= 4 && (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2 py-1 text-[11px] text-success">
                              <CheckCircle2 className="h-3 w-3" />
                              {s.order.status === 4
                                ? "Delivered"
                                : s.order.status === 5
                                  ? "Disputed"
                                  : "Resolved"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Wholesaler;
