import { useEffect, useRef, useState } from "react";
import type { DemoState } from "@/lib/chainguard-data";

export interface ReplayStep {
  t: number; // ms offset
  state: DemoState;
  label: string;
  focus?: string; // checkpoint id
}

const SCRIPT: ReplayStep[] = [
  { t: 0,    state: "normal",  label: "T-00:00 · Stream nominal",                  focus: "cp-3" },
  { t: 1800, state: "warning", label: "T+00:02 · Temp climbing → 8.7°C",           focus: "cp-3" },
  { t: 3600, state: "warning", label: "T+00:04 · Cold-chain threshold breached",   focus: "cp-3" },
  { t: 5400, state: "fraud",   label: "T+00:06 · Tilt 84° + unknown RFID scan",    focus: "cp-3" },
  { t: 7200, state: "fraud",   label: "T+00:08 · Kwala freezes shipment",          focus: "cp-3" },
];

interface Args {
  onState: (s: DemoState) => void;
  onFocus?: (id: string) => void;
}

export const useAnomalyReplay = ({ onState, onFocus }: Args) => {
  const [playing, setPlaying] = useState(false);
  const [stepIdx, setStepIdx] = useState(-1);
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  useEffect(() => () => clear(), []);

  const play = () => {
    clear();
    setPlaying(true);
    setStepIdx(-1);
    SCRIPT.forEach((step, i) => {
      const id = window.setTimeout(() => {
        onState(step.state);
        if (step.focus) onFocus?.(step.focus);
        setStepIdx(i);
        if (i === SCRIPT.length - 1) {
          const endId = window.setTimeout(() => setPlaying(false), 1500);
          timers.current.push(endId);
        }
      }, step.t);
      timers.current.push(id);
    });
  };

  const stop = () => {
    clear();
    setPlaying(false);
    setStepIdx(-1);
  };

  return {
    playing,
    stepIdx,
    totalSteps: SCRIPT.length,
    currentLabel: stepIdx >= 0 ? SCRIPT[stepIdx].label : null,
    play,
    stop,
  };
};
