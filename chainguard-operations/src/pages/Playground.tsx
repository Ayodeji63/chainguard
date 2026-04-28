import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Beaker,
  RotateCcw,
  Radio,
  Thermometer,
  Droplets,
  Activity,
  Play,
  Pause,
  ArrowLeft,
  Zap,
  Send,
  ScanLine,
  Database,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SensorPanel } from "@/components/chainguard/SensorPanel";
import { ThemeToggle } from "@/components/chainguard/ThemeToggle";
import { useToast } from "@/hooks/use-toast";
import { useSensorPlayground } from "@/hooks/useSensorPlayground";

const Playground = () => {
  const {
    state,
    update,
    updateTilt,
    updateRfid,
    pushScan,
    reset,
    commitToChain,
    commitScanToChain,
    syncToBackend,
    isWriting,
    writeError,
  } = useSensorPlayground();

  const playground = useSensorPlayground();

  const { toast } = useToast();
  const { sensors, rfidScans } = state;

  const [autoDrift, setAutoDrift] = useState(false);
  const [rfidTag, setRfidTag] = useState("RFID-9F2A-77C1");
  const [itemId, setItemId] = useState("4821");
  const [location, setLocation] = useState("Lyon, FR");
  const [syncing, setSyncing] = useState(false);

  // Auto-drift
  useEffect(() => {
    if (!autoDrift) return;
    const id = setInterval(() => {
      const t = +(sensors.temperature + (Math.random() - 0.5) * 0.4).toFixed(2);
      const h = Math.max(
        0,
        Math.min(100, Math.round(sensors.humidity + (Math.random() - 0.5) * 2)),
      );
      const m = Math.max(
        0,
        Math.min(
          100,
          Math.round(sensors.tilt.magnitude + (Math.random() - 0.5) * 4),
        ),
      );
      update({
        temperature: t,
        humidity: h,
        tilt: { ...sensors.tilt, magnitude: m, stable: m < 30 },
      });
    }, 1200);
    return () => clearInterval(id);
  }, [autoDrift, sensors, update]);

  // Show chain errors
  useEffect(() => {
    if (writeError) {
      toast({
        title: "Chain transaction failed",
        description: writeError.message,
        variant: "destructive",
      });
    }
  }, [writeError, toast]);

  const parseItemId = (raw: string): bigint | null => {
    const n = parseInt(raw.replace(/\D/g, ""), 10);
    return Number.isNaN(n) ? null : BigInt(n);
  };

  const handleCommitSensors = async () => {
    const id = parseItemId(itemId);
    if (!id) {
      toast({ title: "Invalid Item ID", variant: "destructive" });
      return;
    }
    commitToChain(id, location);
    try {
      setSyncing(true);
      await syncToBackend(itemId, "sensor", location);
      toast({ title: "Sensors synced", description: "Backend logged." });
    } catch {
      toast({
        title: "Backend sync failed",
        description: "On-chain tx may still succeed.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleCommitScan = async () => {
    const id = parseItemId(itemId);
    if (!id) {
      toast({ title: "Invalid Item ID", variant: "destructive" });
      return;
    }
    commitScanToChain(id, location);
    try {
      setSyncing(true);
      await syncToBackend(itemId, "scan", location);
      toast({ title: "Scan synced", description: "Backend logged." });
    } catch {
      toast({
        title: "Backend sync failed",
        description: "On-chain tx may still succeed.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const inject = (
    preset: "spike-temp" | "tamper" | "unauthorized" | "normalize",
  ) => {
    if (preset === "spike-temp") update({ temperature: 11.6 });
    if (preset === "tamper") updateTilt({ magnitude: 84, stable: false });
    if (preset === "unauthorized") {
      updateRfid({
        lastId: "RFID-XX-UNKNOWN",
        valid: false,
        custodian: "UNVERIFIED • 0x???…????",
      });
      pushScan("RFID-XX-UNKNOWN", false);
    }
    if (preset === "normalize") {
      update({
        temperature: 4.2,
        humidity: 48,
        tilt: { stable: true, magnitude: 6 },
        rfid: {
          lastId: "RFID-9F2A-77C1",
          valid: true,
          custodian: "Transporter • 0x8B71…Aa02",
        },
      });
    }
  };

  const itemIdValid = parseItemId(itemId) !== null;

  return (
    <div className="min-h-screen p-3 md:p-4">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
        {/* Header */}
        <header className="glass-strong flex h-16 items-center justify-between rounded-2xl px-5">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-surface-2/60 text-muted-foreground transition hover:text-foreground"
              aria-label="Back to home"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <Beaker
                className="h-5 w-5 text-primary-foreground"
                strokeWidth={2.5}
              />
            </div>
            <div className="leading-tight">
              <h1 className="text-base font-bold tracking-tight">
                Sensor <span className="text-gradient-primary">Playground</span>
              </h1>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Edge Node 042 · Manual Override
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-border/60 bg-surface-2/60 px-3 py-1.5 font-mono text-[10px] text-muted-foreground md:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/60" />
              BROADCASTING ·{" "}
              {new Date(state.updatedAt).toLocaleTimeString("en-GB", {
                hour12: false,
              })}
            </span>
            <ThemeToggle />
            <Button
              size="sm"
              variant="outline"
              onClick={reset}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </header>

        {/* Target item bar */}
        <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Target Item
            </span>
            <Input
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder="4821"
              className="h-8 w-32 font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Location
            </span>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Lyon, FR"
              className="h-8 w-40 font-mono text-xs"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              disabled={!itemIdValid || isWriting || syncing}
              onClick={handleCommitSensors}
              className="gap-1.5 bg-primary text-primary-foreground hover:opacity-90"
            >
              <Send className="h-3.5 w-3.5" />
              {isWriting ? "Writing…" : "Commit Sensors"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!itemIdValid || isWriting || syncing}
              onClick={handleCommitScan}
              className="gap-1.5"
            >
              <ScanLine className="h-3.5 w-3.5" />
              Commit Scan
            </Button>
          </div>
        </div>

        {/* Quick presets */}
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3">
          <span className="mr-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-primary" /> Inject
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => inject("spike-temp")}
            className="gap-1.5"
          >
            <Thermometer className="h-3.5 w-3.5" /> Temp Spike
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => inject("tamper")}
            className="gap-1.5"
          >
            <Activity className="h-3.5 w-3.5" /> Tilt / Tamper
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => inject("unauthorized")}
            className="gap-1.5"
          >
            <Radio className="h-3.5 w-3.5" /> Unauthorized RFID
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => inject("normalize")}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Normalize
          </Button>

          <div className="ml-auto flex items-center gap-2 rounded-lg border border-border/60 bg-surface-2/60 px-3 py-1.5">
            <Label
              htmlFor="drift"
              className="cursor-pointer text-[11px] uppercase tracking-wider text-muted-foreground"
            >
              Auto-drift
            </Label>
            <Switch
              id="drift"
              checked={autoDrift}
              onCheckedChange={setAutoDrift}
            />
            {autoDrift ? (
              <Play className="h-3.5 w-3.5 text-success" />
            ) : (
              <Pause className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          {/* Controls */}
          <div className="flex flex-col gap-3 lg:col-span-8">
            {/* Temperature */}
            <ControlCard icon={Thermometer} title="Temperature" unit="°C">
              <ValueRow
                value={sensors.temperature.toFixed(2)}
                unit="°C"
                hint={`Range ${sensors.tempRange[0]}–${sensors.tempRange[1]}°C`}
              />
              <Slider
                value={[sensors.temperature]}
                min={-5}
                max={20}
                step={0.1}
                onValueChange={([v]) => update({ temperature: +v.toFixed(2) })}
              />
              <RangeRow
                label="Acceptable range"
                low={sensors.tempRange[0]}
                high={sensors.tempRange[1]}
                min={-5}
                max={20}
                onChange={(lo, hi) => update({ tempRange: [lo, hi] })}
              />
            </ControlCard>

            {/* Humidity */}
            <ControlCard icon={Droplets} title="Humidity" unit="%">
              <ValueRow
                value={sensors.humidity}
                unit="%"
                hint={`Range ${sensors.humidityRange[0]}–${sensors.humidityRange[1]}%`}
              />
              <Slider
                value={[sensors.humidity]}
                min={0}
                max={100}
                step={1}
                onValueChange={([v]) => update({ humidity: Math.round(v) })}
              />
              <RangeRow
                label="Acceptable range"
                low={sensors.humidityRange[0]}
                high={sensors.humidityRange[1]}
                min={0}
                max={100}
                onChange={(lo, hi) => update({ humidityRange: [lo, hi] })}
              />
            </ControlCard>

            {/* Tilt */}
            <ControlCard icon={Activity} title="Tilt / Impact" unit="°">
              <ValueRow
                value={sensors.tilt.magnitude}
                unit="°"
                hint={sensors.tilt.stable ? "Stable" : "Tampered"}
              />
              <Slider
                value={[sensors.tilt.magnitude]}
                min={0}
                max={100}
                step={1}
                onValueChange={([v]) =>
                  updateTilt({
                    magnitude: Math.round(v),
                    stable: Math.round(v) < 30,
                  })
                }
              />
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-surface-2/40 px-3 py-2">
                <Label htmlFor="stable" className="text-xs">
                  Force stable state
                </Label>
                <Switch
                  id="stable"
                  checked={sensors.tilt.stable}
                  onCheckedChange={(stable) => updateTilt({ stable })}
                />
              </div>
            </ControlCard>

            {/* RFID */}
            <ControlCard icon={Radio} title="RFID Scanner" unit="">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
                <Input
                  value={rfidTag}
                  onChange={(e) => setRfidTag(e.target.value)}
                  placeholder="RFID-XXXX-XXXX"
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    pushScan(rfidTag, true);
                    handleCommitScan();
                  }}
                  className="bg-success/20 text-success hover:bg-success/30"
                >
                  Scan ✓ Valid
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    pushScan(rfidTag || "RFID-XX-UNKNOWN", false);
                    handleCommitScan();
                  }}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  Scan ✗ Reject
                </Button>
              </div>

              <div className="rounded-lg border border-border/50 bg-surface-2/40 p-2">
                <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Scan history
                </p>
                {rfidScans.length === 0 ? (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    No scans yet — emit one above.
                  </p>
                ) : (
                  <ul className="scrollbar-thin max-h-40 space-y-1 overflow-y-auto">
                    {rfidScans.map((s) => (
                      <motion.li
                        key={s.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between gap-2 rounded border border-border/40 bg-surface-3/40 px-2 py-1 font-mono text-[11px]"
                      >
                        <span
                          className={
                            s.valid ? "text-success" : "text-destructive"
                          }
                        >
                          {s.valid ? "✓" : "✗"} {s.tag}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(s.ts).toLocaleTimeString("en-GB", {
                            hour12: false,
                          })}
                        </span>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </div>
            </ControlCard>
          </div>

          {/* Live preview */}
          <div className="lg:col-span-4">
            <div className="sticky top-3 h-[calc(100vh-120px)] min-h-[560px]">
              <SensorPanel sensors={sensors} />
            </div>
          </div>
        </div>

        <footer className="px-2 pb-2 pt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Playground broadcasts to all role consoles in real-time via local edge
          bus. Chain commits use item #{itemId || "—"} @ {location}.
        </footer>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */
const ControlCard = ({
  icon: Icon,
  title,
  unit,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  unit: string;
  children: React.ReactNode;
}) => (
  <div className="glass flex flex-col gap-3 rounded-2xl p-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </div>
      {unit && (
        <span className="font-mono text-[10px] text-muted-foreground">
          unit: {unit}
        </span>
      )}
    </div>
    {children}
  </div>
);

const ValueRow = ({
  value,
  unit,
  hint,
}: {
  value: string | number;
  unit: string;
  hint?: string;
}) => (
  <div className="flex items-end justify-between">
    <div className="flex items-baseline gap-1">
      <span className="font-mono text-3xl font-bold tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </div>
    {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
  </div>
);

const RangeRow = ({
  label,
  low,
  high,
  min,
  max,
  onChange,
}: {
  label: string;
  low: number;
  high: number;
  min: number;
  max: number;
  onChange: (lo: number, hi: number) => void;
}) => (
  <div className="rounded-lg border border-border/50 bg-surface-2/40 p-2">
    <div className="mb-1.5 flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {low} – {high}
      </span>
    </div>
    <Slider
      value={[low, high]}
      min={min}
      max={max}
      step={1}
      onValueChange={([lo, hi]) => onChange(lo, hi)}
    />
  </div>
);

export default Playground;
