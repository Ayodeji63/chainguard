import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TopBar } from "@/components/chainguard/TopBar";
import { AlertBanner } from "@/components/chainguard/AlertBanner";
import { ShipmentMap } from "@/components/chainguard/ShipmentMap";
import { SensorPanel } from "@/components/chainguard/SensorPanel";
import { EventTimeline } from "@/components/chainguard/EventTimeline";
import { ProductInfoPanel } from "@/components/chainguard/ProductInfoPanel";
import { DemoStateSwitcher } from "@/components/chainguard/DemoStateSwitcher";
import { ReplayControl } from "@/components/chainguard/ReplayControl";
import { StreamIndicator } from "@/components/chainguard/StreamIndicator";
import { buildData, type DemoState } from "@/lib/chainguard-data";
import { useTelemetryStream } from "@/hooks/useTelemetryStream";
import { useAnomalyReplay } from "@/hooks/useAnomalyReplay";

const VALID_STATES: DemoState[] = ["normal", "warning", "fraud"];

const Index = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialState = (() => {
    const s = searchParams.get("state");
    return s && VALID_STATES.includes(s as DemoState) ? (s as DemoState) : "normal";
  })();

  const [state, setStateRaw] = useState<DemoState>(initialState);
  const [now, setNow] = useState(new Date());
  const [tick, setTick] = useState(0);

  // Sync state -> URL
  const setState = useCallback(
    (s: DemoState) => {
      setStateRaw(s);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (s === "normal") next.delete("state");
          else next.set("state", s);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Simulated telemetry tick (sensor jitter)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const data = useMemo(() => {
    const base = buildData(state);
    const jitter = (n: number, amp: number) => +(n + (Math.sin(tick * 0.7) * amp)).toFixed(1);
    base.sensors.temperature = jitter(base.sensors.temperature, state === "normal" ? 0.3 : 0.5);
    base.sensors.humidity = Math.round(base.sensors.humidity + Math.cos(tick * 0.5) * 1);
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, tick]);

  // Deep-linked checkpoint selection (?cp=cp-3)
  const cpParam = searchParams.get("cp");
  const initialCp =
    cpParam && data.checkpoints.some((c) => c.id === cpParam) ? cpParam : "cp-3";
  const [selectedId, setSelectedIdRaw] = useState(initialCp);

  const setSelectedId = useCallback(
    (id: string) => {
      setSelectedIdRaw(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("cp", id);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // React to back/forward URL changes
  useEffect(() => {
    if (cpParam && cpParam !== selectedId && data.checkpoints.some((c) => c.id === cpParam)) {
      setSelectedIdRaw(cpParam);
    }
  }, [cpParam, selectedId, data.checkpoints]);

  // Auto-select anomaly node on fraud
  useEffect(() => {
    if (data.alert?.node) setSelectedIdRaw(data.alert.node);
  }, [data.alert?.node]);

  const selected = data.checkpoints.find((c) => c.id === selectedId) ?? data.checkpoints[0];

  // WebSocket-style telemetry stream
  const { connected, packets, latencyMs } = useTelemetryStream({ state });

  // Anomaly replay sequence
  const replay = useAnomalyReplay({
    onState: setState,
    onFocus: setSelectedIdRaw,
  });

  return (
    <div className="min-h-screen p-3 md:p-4">
      {/* SEO */}
      <h1 className="sr-only">ChainGuard — Real-Time Blockchain Supply Chain Monitoring</h1>

      <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
        <TopBar state={state} now={now} />

        {/* stream + replay strip */}
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

        {/* alert + demo switcher row */}
        <div className="flex flex-col-reverse items-stretch gap-3 lg:flex-row lg:items-start">
          <div className="flex-1">
            <AlertBanner alert={data.alert} variant={state === "fraud" ? "fraud" : "warning"} />
          </div>
          <DemoStateSwitcher state={state} onChange={setState} />
        </div>

        {/* main grid */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          {/* Left column — timeline + product info */}
          <div className="flex flex-col gap-3 lg:col-span-3">
            <ProductInfoPanel product={data.product} selected={selected} />
            <div className="h-[420px] lg:h-[calc(100vh-460px)] lg:min-h-[360px]">
              <EventTimeline events={data.events} />
            </div>
          </div>

          {/* Center — Map */}
          <div className="lg:col-span-6">
            <div className="h-[520px] lg:h-[calc(100vh-200px)] lg:min-h-[560px]">
              <ShipmentMap
                checkpoints={data.checkpoints}
                selectedId={selectedId}
                onSelect={setSelectedId}
                state={state}
              />
            </div>
          </div>

          {/* Right — sensors */}
          <div className="lg:col-span-3">
            <div className="h-[640px] lg:h-[calc(100vh-200px)] lg:min-h-[560px]">
              <SensorPanel sensors={data.sensors} />
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between px-2 pb-2 pt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>ChainGuard v1.0 · Powered by Kwala Automation</span>
          <span>Telemetry stream: Raspberry Pi · Edge Node 042 · {packets.length} pkts</span>
        </footer>
      </div>
    </div>
  );
};

export default Index;
