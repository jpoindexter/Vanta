import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Text } from "ink";
import {
  envForOperatingMode,
  nextOperatingMode,
  resolveOperatingMode,
  type OperatingMode,
} from "../modes/operating-mode.js";
import { ACTIVITY, FOCUS, GOAL } from "../term/palette.js";

export type Mode = OperatingMode;

export function cycleMode(mode: Mode, setMode: (m: Mode) => void): void {
  setMode(nextOperatingMode(mode));
}

export function useModeState(
  setPlanActive: (active: boolean) => void,
): { mode: Mode; cycle: () => void; getMode: () => Mode } {
  const [mode, setMode] = useState<Mode>(() => resolveOperatingMode(process.env));
  const lastCycleAt = useRef(0);
  useEffect(() => {
    setPlanActive(resolveOperatingMode(process.env) === "plan");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cycle = (): void => {
    const now = Date.now();
    if (now - lastCycleAt.current < 75) return;
    lastCycleAt.current = now;
    const next = nextOperatingMode(mode);
    Object.assign(process.env, envForOperatingMode(next));
    setPlanActive(next === "plan");
    setMode(next);
  };
  const getMode = useCallback((): Mode => resolveOperatingMode(process.env), []);
  return { mode, cycle, getMode };
}

export function ModeLine(props: { mode: Mode }): ReactElement {
  if (props.mode === "default") {
    return <Text><Text dimColor>  ▮▮ manual mode on</Text><Text dimColor> · ? for shortcuts</Text></Text>;
  }
  if (props.mode === "acceptEdits") {
    return <Text><Text bold color={GOAL}>  ▸▸ accept edits on</Text><Text dimColor> (shift+tab to cycle)</Text></Text>;
  }
  if (props.mode === "plan") {
    return <Text><Text bold color={FOCUS}>  ▮▮ plan mode on</Text><Text dimColor> (shift+tab to cycle)</Text></Text>;
  }
  if (props.mode === "auto") {
    return <Text><Text bold color={ACTIVITY}>  ▸▸ auto mode on</Text><Text dimColor> (shift+tab to cycle)</Text></Text>;
  }
  return <Text><Text bold color="yellow">  ⚠ full access on</Text><Text dimColor> (shift+tab returns to manual)</Text></Text>;
}
