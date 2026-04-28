import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { Navigate } from "react-router-dom";
import {
  Truck,
  Thermometer,
  Droplets,
  Activity,
  AlertTriangle,
  Beaker,
  Package,
  ShieldCheck,
  Wallet,
  ScanLine,
  HandCoins,
  ArrowRightLeft,
  Loader2,
  X,
  ArrowLeft,
  MapPin,
  Radio,
  Clock,
  Eye,
} from "lucide-react";
import { Link } from "react-router-dom";
import { RoleHeader } from "@/components/chainguard/RoleHeader";
import { ShipmentMap } from "@/components/chainguard/ShipmentMap";
import { SensorPanel } from "@/components/chainguard/SensorPanel";
import { AlertBanner } from "@/components/chainguard/AlertBanner";
import { StreamIndicator } from "@/components/chainguard/StreamIndicator";
import { ReplayControl } from "@/components/chainguard/ReplayControl";
import { buildData, type DemoState } from "@/lib/chainguard-data";
import { useTelemetryStream } from "@/hooks/useTelemetryStream";
import { useAnomalyReplay } from "@/hooks/useAnomalyReplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSensorPlayground } from "@/hooks/useSensorPlayground";
import { useToast } from "@/hooks/use-toast";
import {
  SupplyChainSourceAbi,
  SupplyChainTokenAbi,
  supplyChainAddress,
  supplyChainEscrowAbi,
  supplyChainEscrowAddress,
  supplyChainTokenAddress,
} from "../../contract.js";

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
  shippingFee: bigint;
  carrierDeposit: bigint;
  status: number;
  liableParty: number;
  exists: boolean;
  createdAt: bigint;
  pickedUpAt: bigint;
  deliveredAt: bigint;
  breachReason: string;
}

interface Shipment {
  item: OnChainItem;
  order: EscrowOrder | null;
  batchId: string;
}

const ORDER_STATUS_LABELS = [
  "Created",
  "CarrierReady",
  "Funded",
  "InTransit",
  "Delivered",
  "Disputed",
  "Resolved",
] as const;

const STATUS_COLORS: Record<number, string> = {
  0: "bg-warning/15 text-warning border-warning/30",
  1: "bg-primary/15 text-primary border-primary/30",
  2: "bg-accent/15 text-accent border-accent/30",
  3: "bg-success/15 text-success border-success/30",
  4: "bg-muted text-muted-foreground border-border",
  5: "bg-destructive/15 text-destructive border-destructive/30",
  6: "bg-muted text-muted-foreground border-border",
};

const formatAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type TabKey = "deposited" | "scanned" | "completed";

const TAB_CONFIG: { key: TabKey; label: string }[] = [
  { key: "deposited", label: "Deposited" },
  { key: "scanned", label: "Scanned" },
  { key: "completed", label: "Completed" },
];

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------
const Carrier = () => {
  const { isConnected, address } = useAccount();
  const publicClient = usePublicClient();
  const { toast } = useToast();
  const {
    writeContract,
    isPending: isWriting,
    error: writeError,
  } = useWriteContract();

  const [demoState, setDemoState] = useState<DemoState>("normal");
  const [selectedId, setSelectedId] = useState("cp-3");
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("deposited");

  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [focusedBatchId, setFocusedBatchId] = useState<string | null>(null);

  const [bondModalOpen, setBondModalOpen] = useState(false);
  const [bondOrderId, setBondOrderId] = useState<bigint | null>(null);
  const [bondShippingFee, setBondShippingFee] = useState("");
  const [bondCarrierDeposit, setBondCarrierDeposit] = useState("");

  const account = useAccount();

  const isActing = (action: string, id: bigint) =>
    pendingAction === `${action}-${id}`;

  const playground = useSensorPlayground();
  const data = useMemo(() => {
    const base = buildData(demoState);
    base.sensors = { ...base.sensors, ...playground.state.sensors };
    return base;
  }, [demoState, playground.state.sensors]);

  const { connected, packets, latencyMs } = useTelemetryStream({
    state: demoState,
  });
  const replay = useAnomalyReplay({
    onState: setDemoState,
    onFocus: setSelectedId,
  });

  // ----------------------------------------------------------------
  // Fetch live items + escrow orders
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!publicClient || !address) return;

    const fetchAll = async () => {
      setIsLoading(true);
      try {
        const count = await publicClient.readContract({
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

        const itemResults = await publicClient.multicall({
          contracts: ids.map((id) => ({
            address: supplyChainAddress,
            abi: SupplyChainSourceAbi,
            functionName: "getItem",
            args: [id],
          })),
          authorizationList: undefined,
        });

        const orderResults = await publicClient.multicall({
          contracts: ids.map((id) => ({
            address: supplyChainEscrowAddress,
            abi: supplyChainEscrowAbi,
            functionName: "getOrderByItem",
            args: [id],
          })),
          authorizationList: undefined,
        });

        const orderIds: bigint[] = [];
        const orderIndexMap: number[] = [];

        for (let i = 0; i < ids.length; i++) {
          const oRes = orderResults[i];
          if (oRes.status === "success" && oRes.result) {
            const raw = oRes.result as any;
            if (raw.exists && raw.orderId) {
              orderIds.push(raw.orderId);
              orderIndexMap.push(i);
            }
          }
        }

        let itemByOrderResults: any[] = [];
        if (orderIds.length > 0) {
          const multicallRes = await publicClient.multicall({
            contracts: orderIds.map((orderId) => ({
              address: supplyChainAddress,
              abi: SupplyChainSourceAbi,
              functionName: "getItemByOrder",
              args: [orderId],
            })),
            authorizationList: undefined,
          });
          itemByOrderResults = multicallRes;
        }

        const itemByOrderMap = new Map<bigint, OnChainItem>();
        for (let j = 0; j < orderIds.length; j++) {
          const res = itemByOrderResults[j];
          if (res?.status === "success" && res.result) {
            const it = res.result as unknown as OnChainItem;
            itemByOrderMap.set(it.id, it);
          }
        }

        const mapped: Shipment[] = [];
        for (let i = 0; i < ids.length; i++) {
          const itemRes = itemResults[i];
          const orderRes = orderResults[i];

          if (itemRes.status !== "success" || !itemRes.result) continue;

          let item = itemRes.result as unknown as OnChainItem;
          const enriched = itemByOrderMap.get(item.id);
          if (enriched) {
            item = {
              ...item,
              rfidTag: enriched.rfidTag || item.rfidTag,
            };
          }

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
              shippingFee: raw.shippingFee,
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
            item,
            order,
            batchId: `BATCH-CG-2026-${String(item.id).padStart(5, "0")}`,
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
  }, [publicClient, address, toast]);

  useEffect(() => {
    if (writeError) {
      toast({
        title: "Transaction failed",
        description: writeError.message,
        variant: "destructive",
      });
      setPendingAction(null);
    }
  }, [writeError, toast]);

  if (!isConnected) return <Navigate to="/" replace />;

  // ----------------------------------------------------------------
  // Derived data
  // ----------------------------------------------------------------
  const isMyShipment = (s: Shipment) =>
    s.order?.carrier.wallet.toLowerCase() === address?.toLowerCase();

  const myShipments = useMemo(
    () => shipments.filter(isMyShipment),
    [shipments, address],
  );

  const tabShipments = useMemo(() => {
    switch (activeTab) {
      case "deposited":
        return myShipments.filter((s) => (s.order?.status ?? 0) < 3);
      case "scanned":
        return myShipments.filter((s) => s.order?.status === 3);
      case "completed":
        return myShipments.filter((s) => (s.order?.status ?? 0) >= 4);
      default:
        return myShipments;
    }
  }, [myShipments, activeTab]);

  const tabCounts = useMemo(() => {
    return {
      deposited: myShipments.filter((s) => (s.order?.status ?? 0) < 3).length,
      scanned: myShipments.filter((s) => s.order?.status === 3).length,
      completed: myShipments.filter((s) => (s.order?.status ?? 0) >= 4).length,
    };
  }, [myShipments]);

  const focusedShipment = useMemo(
    () => myShipments.find((s) => s.batchId === focusedBatchId),
    [myShipments, focusedBatchId],
  );

  const activeCheckpointId = useMemo(() => {
    if (!focusedShipment) return "cp-3";
    const st = focusedShipment.order?.status ?? 0;
    if (st <= 1) return "cp-1";
    if (st === 2) return "cp-2";
    if (st === 3) return "cp-3";
    if (st >= 4) return "cp-4";
    return "cp-3";
  }, [focusedShipment]);

  const mapState = useMemo<DemoState>(() => {
    if (!focusedShipment) return demoState;
    const st = focusedShipment.order?.status ?? 0;
    if (st === 5) return "fraud";
    return demoState;
  }, [focusedShipment, demoState]);

  // ----------------------------------------------------------------
  // Navigation
  // ----------------------------------------------------------------
  const openDetail = (batchId: string) => {
    setFocusedBatchId(batchId);
    setViewMode("detail");
  };

  const backToList = () => {
    setViewMode("list");
    setFocusedBatchId(null);
  };

  // ----------------------------------------------------------------
  // Actions
  // ----------------------------------------------------------------
  const openBondModal = (orderId: bigint) => {
    setBondOrderId(orderId);
    setBondShippingFee("");
    setBondCarrierDeposit("");
    setBondModalOpen(true);
  };

  const closeBondModal = () => {
    setBondModalOpen(false);
    setBondOrderId(null);
    setBondShippingFee("");
    setBondCarrierDeposit("");
  };

  const submitBondDeposit = () => {
    if (!bondOrderId) return;

    const shippingFee = BigInt(bondShippingFee);
    const carrierDeposit = BigInt(bondCarrierDeposit);

    if (shippingFee <= 0n || carrierDeposit <= 0n) {
      toast({
        title: "Invalid values",
        description: "Both shipping fee and deposit must be greater than 0.",
        variant: "destructive",
      });
      return;
    }

    setBondModalOpen(false);
    setPendingAction(`bond-${bondOrderId}`);

    writeContract(
      {
        abi: SupplyChainTokenAbi,
        address: supplyChainTokenAddress,
        functionName: "approve",
        args: [supplyChainEscrowAddress, carrierDeposit],
        chain: account.chain,
        account: account.address,
        gas: 500000,
      },
      {
        onSuccess: () => {
          setPendingAction(`bonding-${bondOrderId}`);
          toast({
            title: "Approval successful",
            description: "Proceeding to deposit bond in escrow.",
          });

          writeContract(
            {
              abi: supplyChainEscrowAbi,
              address: supplyChainEscrowAddress,
              functionName: "depositCarrierBond",
              args: [bondOrderId, shippingFee, carrierDeposit],
              chain: account.chain,
              account: account.address,
              gas: 500000,
            },
            {
              onSuccess: () => {
                setPendingAction(null);
                toast({
                  title: "Bond deposited",
                  description: `Order #${bondOrderId} bond locked in escrow.`,
                });
              },
              onError: () => setPendingAction(null),
            },
          );
        },
        onError: () => setPendingAction(null),
      },
    );
  };

  const confirmPickup = (orderId: bigint) => {
    setPendingAction(`pickup-${orderId}`);
    writeContract(
      {
        abi: supplyChainEscrowAbi,
        address: supplyChainEscrowAddress,
        functionName: "confirmPickup",
        args: [orderId],
        chain: account.chain,
        account: account.address,
      },
      {
        onSuccess: () => {
          setPendingAction(null);
          toast({
            title: "Pickup confirmed",
            description: `Order #${orderId} now in transit.`,
          });
        },
        onError: () => setPendingAction(null),
      },
    );
  };

  const scanItem = (itemId: bigint, location: string) => {
    setPendingAction(`scan-${itemId}`);
    writeContract(
      {
        abi: SupplyChainSourceAbi,
        address: supplyChainAddress,
        functionName: "scanItem",
        args: [itemId, location],
        chain: account.chain,
        account: account.address,
        gas: 500000,
      },
      {
        onSuccess: () => {
          setPendingAction(null);
          toast({
            title: "Item scanned",
            description: `Item #${itemId} scanned at ${location}.`,
          });
        },
        onError: () => setPendingAction(null),
      },
    );
  };

  const custodian = "0x8371E519177f81b93287f750dcd06Ce894c12cc5";

  const handoffItem = (itemId: bigint, to: string, location: string) => {
    setPendingAction(`handoff-${itemId}`);
    writeContract(
      {
        abi: SupplyChainSourceAbi,
        address: supplyChainAddress,
        functionName: "handoffItem",
        args: [itemId, custodian as `0x${string}`, location],
        chain: account.chain,
        account: account.address,
        gas: 400000,
      },
      {
        onSuccess: () => {
          setPendingAction(null);
          toast({
            title: "Custody handed off",
            description: `Item #${itemId} transferred.`,
          });
        },
        onError: () => setPendingAction(null),
      },
    );
  };

  // ----------------------------------------------------------------
  // Stats
  // ----------------------------------------------------------------
  const inTransit = myShipments.filter(
    (s) => s.order && s.order.status === 3,
  ).length;
  const pendingBond = myShipments.filter(
    (s) => s.order && s.order.status === 0,
  ).length;

  const kpis = [
    {
      label: "My Shipments",
      value: myShipments.length,
      Icon: Package,
      accent: "text-primary",
    },
    {
      label: "In Transit",
      value: inTransit,
      Icon: Truck,
      accent: "text-accent",
    },
    {
      label: "Bonds Pending",
      value: pendingBond,
      Icon: HandCoins,
      accent: "text-warning",
    },
    {
      label: "Avg Temp",
      value: `${data.sensors.temperature.toFixed(1)}°C`,
      Icon: Thermometer,
      accent: demoState === "fraud" ? "text-destructive" : "text-success",
    },
    {
      label: "Humidity",
      value: `${data.sensors.humidity}%`,
      Icon: Droplets,
      accent: "text-primary",
    },
    {
      label: "Tilt Mag",
      value: data.sensors.tilt.magnitude,
      Icon: Activity,
      accent: data.sensors.tilt.stable ? "text-success" : "text-destructive",
    },
  ];

  return (
    <div className="min-h-screen p-3 md:p-4">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
        <RoleHeader
          role="carrier"
          label="Carrier"
          subtitle={
            viewMode === "detail" && focusedShipment
              ? `Managing ${focusedShipment.batchId}`
              : "Live Telemetry Active"
          }
        />

        <AnimatePresence mode="wait">
          {viewMode === "list" && (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-3"
            >
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                {kpis.map((k) => (
                  <motion.div
                    key={k.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass flex items-center justify-between rounded-2xl p-4"
                  >
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {k.label}
                      </p>
                      <p className="mt-1 text-2xl font-bold tabular-nums">
                        {k.value}
                      </p>
                    </div>
                    <k.Icon
                      className={`h-7 w-7 ${k.accent}`}
                      strokeWidth={1.8}
                    />
                  </motion.div>
                ))}
              </div>

              {/* Tabs */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-surface-2/60 p-1">
                  {TAB_CONFIG.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setActiveTab(t.key)}
                      className={`relative flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                        activeTab === t.key
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.label}
                      <span
                        className={`flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                          activeTab === t.key
                            ? "bg-accent-foreground/20 text-accent-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {tabCounts[t.key]}
                      </span>
                    </button>
                  ))}
                </div>

                <Link to="/playground">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-[11px] uppercase tracking-wider"
                  >
                    <Beaker className="h-3.5 w-3.5" /> Playground
                  </Button>
                </Link>
              </div>

              {/* Shipments Grid */}
              {isLoading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Fetching on-chain data…
                </div>
              ) : tabShipments.length === 0 ? (
                <div className="py-20 text-center text-sm text-muted-foreground">
                  No {activeTab} orders found.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {tabShipments.map((s) => {
                    const st = s.order?.status ?? 0;
                    const statusLabel = ORDER_STATUS_LABELS[st] ?? "Unknown";
                    const statusStyle =
                      STATUS_COLORS[st] ??
                      "bg-muted text-muted-foreground border-border";

                    return (
                      <motion.div
                        key={s.batchId}
                        layoutId={s.batchId}
                        onClick={() => openDetail(s.batchId)}
                        className="group flex cursor-pointer flex-col gap-4 rounded-2xl border border-border/60 bg-surface-2/60 p-5 transition-colors hover:border-accent/40 hover:bg-surface-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                              <Truck className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-mono text-xs font-bold">
                                {s.batchId}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                RFID: {s.item.rfidTag || "—"}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusStyle}`}
                          >
                            {statusLabel}
                          </span>
                        </div>

                        <div className="flex flex-col gap-2 text-[11px] text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5" />
                            {s.item.lastLocation || "—"}
                          </div>
                          <div className="flex items-center gap-2">
                            <Radio className="h-3.5 w-3.5" />
                            {Number(s.item.scanCount)} scans
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5" />
                            Custodian: {formatAddr(s.item.currentCustodian)}
                          </div>
                        </div>

                        <div className="mt-auto flex items-center justify-between border-t border-border/40 pt-3">
                          <div className="text-[11px]">
                            {s.order ? (
                              <span className="font-mono text-foreground">
                                {s.order.orderValue.toString()} SCT
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                No order
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 gap-1.5 text-[11px] text-accent hover:bg-accent/10 hover:text-accent"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(s.batchId);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View Details
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              <div className="glass rounded-xl p-3 text-[11px] text-muted-foreground">
                <AlertTriangle className="mr-1 inline h-3 w-3 text-warning" />
                Select a shipment to view live telemetry, manage custody, and
                execute on-chain actions.
              </div>
            </motion.div>
          )}

          {viewMode === "detail" && focusedShipment && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-3"
            >
              {/* Back + Context */}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={backToList}
                  className="gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  All Shipments
                </Button>

                <div className="ml-auto flex items-center gap-2">
                  {(["normal", "warning", "fraud"] as DemoState[]).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={demoState === s ? "default" : "outline"}
                      onClick={() => setDemoState(s)}
                      className="text-[11px] uppercase tracking-wider"
                    >
                      {s}
                    </Button>
                  ))}
                  <Link to="/playground">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-[11px] uppercase tracking-wider"
                    >
                      <Beaker className="h-3.5 w-3.5" /> Playground
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-3">
                <StreamIndicator
                  connected={connected}
                  latencyMs={latencyMs}
                  lastPacket={packets[0]}
                />
                <ReplayControl
                  playing={replay.playing}
                  stepIdx={replay.stepIdx}
                  totalSteps={replay.totalSteps}
                  currentLabel={replay.currentLabel}
                  onPlay={replay.play}
                  onStop={replay.stop}
                />
              </div>

              <AlertBanner
                alert={data.alert}
                variant={demoState === "fraud" ? "fraud" : "warning"}
              />

              {/* Map + Sensor */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <div className="relative h-[520px] lg:h-[calc(100vh-340px)] lg:min-h-[520px]">
                    <ShipmentMap
                      checkpoints={data.checkpoints}
                      selectedId={activeCheckpointId}
                      onSelect={setSelectedId}
                      state={mapState}
                    />
                    <div className="absolute top-3 left-3 z-10 rounded-xl border border-border/60 bg-surface-1/90 backdrop-blur-md p-3 shadow-lg">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Tracking
                      </p>
                      <p className="mt-0.5 font-mono text-xs font-bold">
                        {focusedShipment.batchId}
                      </p>
                      <p className="text-[10px] text-accent">
                        {activeCheckpointId.toUpperCase()} •{" "}
                        {ORDER_STATUS_LABELS[
                          focusedShipment.order?.status ?? 0
                        ] ?? "Unknown"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <div className="h-[640px] lg:h-[calc(100vh-340px)] lg:min-h-[520px]">
                    <SensorPanel sensors={data.sensors} />
                  </div>
                </div>
              </div>

              {/* Order Detail / Actions */}
              <div className="glass-strong rounded-2xl p-5">
                <div className="mb-4 flex flex-col gap-1">
                  <h2 className="text-sm font-bold">
                    {focusedShipment.batchId}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Order #{String(focusedShipment.order?.orderId ?? "—")} •
                    RFID {focusedShipment.item.rfidTag || "—"}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Info Column */}
                  <div className="flex flex-col gap-3 text-[11px] text-muted-foreground">
                    <div className="flex justify-between border-b border-border/40 pb-2">
                      <span>Status</span>
                      <span className="font-semibold text-foreground">
                        {focusedShipment.order
                          ? (ORDER_STATUS_LABELS[
                              focusedShipment.order.status
                            ] ?? "Unknown")
                          : "No Order"}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-2">
                      <span>Custodian</span>
                      <span className="font-mono text-foreground">
                        {formatAddr(focusedShipment.item.currentCustodian)}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-2">
                      <span>Location</span>
                      <span className="text-foreground">
                        {focusedShipment.item.lastLocation || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-2">
                      <span>Total Scans</span>
                      <span className="text-foreground">
                        {Number(focusedShipment.item.scanCount)}
                      </span>
                    </div>
                    {focusedShipment.order && (
                      <>
                        <div className="flex justify-between border-b border-border/40 pb-2">
                          <span>Order Value</span>
                          <span className="font-mono text-foreground">
                            {focusedShipment.order.orderValue.toString()} SCT
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-border/40 pb-2">
                          <span>Shipping Fee</span>
                          <span className="font-mono text-foreground">
                            {focusedShipment.order.shippingFee.toString()} SCT
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-border/40 pb-2">
                          <span>Carrier Deposit</span>
                          <span className="font-mono text-foreground">
                            {focusedShipment.order.carrierDeposit.toString()}{" "}
                            SCT
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions Column */}
                  <div className="flex flex-col gap-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Available Actions
                    </p>

                    {focusedShipment.order && (
                      <div className="flex flex-wrap gap-2">
                        {/* Deposit Bond */}
                        {focusedShipment.order.status === 0 && (
                          <Button
                            size="sm"
                            disabled={isWriting}
                            onClick={() =>
                              openBondModal(focusedShipment.order!.orderId)
                            }
                            className="gap-1.5 bg-warning text-warning-foreground hover:bg-warning/90"
                          >
                            <Wallet className="h-3.5 w-3.5" />
                            {isActing("bond", focusedShipment.order.orderId) ||
                            isActing("bonding", focusedShipment.order.orderId)
                              ? "Depositing…"
                              : "Deposit Bond"}
                          </Button>
                        )}

                        {/* Confirm Pickup */}
                        {focusedShipment.order.status === 2 && (
                          <Button
                            size="sm"
                            disabled={isWriting}
                            onClick={() =>
                              confirmPickup(focusedShipment.order!.orderId)
                            }
                            className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                          >
                            <Truck className="h-3.5 w-3.5" />
                            {isActing("pickup", focusedShipment.order.orderId)
                              ? "Confirming…"
                              : "Confirm Pickup"}
                          </Button>
                        )}

                        {/* Scan Item */}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isWriting}
                          onClick={() =>
                            scanItem(
                              focusedShipment.item.id,
                              focusedShipment.item.lastLocation ||
                                "Transit Hub",
                            )
                          }
                          className="gap-1.5"
                        >
                          <ScanLine className="h-3.5 w-3.5" />
                          {isActing("scan", focusedShipment.item.id)
                            ? "Scanning…"
                            : "Scan Item"}
                        </Button>

                        {/* Handoff */}
                        {focusedShipment.order.status === 3 && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isWriting}
                            onClick={() =>
                              handoffItem(
                                focusedShipment.item.id,
                                focusedShipment.order!.wholesaler.wallet,
                                focusedShipment.order!.wholesaler.wallet.slice(
                                  0,
                                  6,
                                ) + " Warehouse",
                              )
                            }
                            className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                            {isActing("handoff", focusedShipment.item.id)
                              ? "Handing off…"
                              : "Handoff Custody"}
                          </Button>
                        )}
                      </div>
                    )}

                    {!focusedShipment.order && (
                      <p className="text-sm text-muted-foreground">
                        No escrow order attached to this item.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="glass rounded-xl p-3 text-[11px] text-muted-foreground">
                <AlertTriangle className="mr-1 inline h-3 w-3 text-warning" />
                Detail view for {focusedShipment.batchId}. Click "All Shipments"
                to return to the list.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bond Deposit Modal */}
      {bondModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-border/60 bg-surface-1 p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold">Deposit Carrier Bond</h3>
              <button
                onClick={closeBondModal}
                className="rounded-lg p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="shippingFee"
                  className="text-[11px] uppercase tracking-wider"
                >
                  Shipping Fee (token units)
                </Label>
                <Input
                  id="shippingFee"
                  type="number"
                  placeholder="e.g. 50000000"
                  value={bondShippingFee}
                  onChange={(e) => setBondShippingFee(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Amount the wholesaler will pay you for shipping.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="carrierDeposit"
                  className="text-[11px] uppercase tracking-wider"
                >
                  Carrier Deposit (token units)
                </Label>
                <Input
                  id="carrierDeposit"
                  type="number"
                  placeholder="e.g. 1000000000000000000"
                  value={bondCarrierDeposit}
                  onChange={(e) => setBondCarrierDeposit(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Collateral locked in escrow. Returned on successful delivery.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={closeBondModal}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={submitBondDeposit}
                  disabled={
                    !bondShippingFee || !bondCarrierDeposit || isWriting
                  }
                  className="flex-1 gap-1.5 bg-warning text-warning-foreground hover:bg-warning/90"
                >
                  <Wallet className="h-3.5 w-3.5" />
                  {isWriting ? "Processing…" : "Approve & Deposit"}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Carrier;
