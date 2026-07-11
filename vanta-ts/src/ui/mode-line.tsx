import { useEffect, useState, type ReactElement } from "react";
import { Text } from "ink";
import { envForPermissionMode, resolvePermissionMode, type PermissionMode } from "../modes/permission-mode.js";
import type { Pending } from "./use-agent.js";

export type Mode = PermissionMode;
const NEXT_MODE: Record<Mode, Mode> = { default: "acceptEdits", acceptEdits: "auto", auto: "default" };

export function cycleMode(mode: Mode, setMode: (m: Mode) => void, runSlash: (s: string) => void): void {
  const next = NEXT_MODE[mode];
  void runSlash;
  setMode(next);
}

export function shouldAutoApprove(pending: Pending | null, mode: Mode): boolean {
  return Boolean(pending && !pending.fresh && mode === "auto");
}

function useAutoApprove(pending: Pending | null, mode: Mode, setPending: (p: Pending | null) => void): void {
  useEffect(() => {
    if (pending && shouldAutoApprove(pending, mode)) { pending.resolve(true); setPending(null); }
  }, [pending, mode]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useModeState(
  pending: Pending | null,
  setPending: (p: Pending | null) => void,
  runSlash: (s: string) => void,
): { mode: Mode; cycle: () => void } {
  const [mode, setMode] = useState<Mode>(() => resolvePermissionMode(process.env));
  useAutoApprove(pending, mode, setPending);
  useEffect(() => { Object.assign(process.env, envForPermissionMode(mode)); }, [mode]);
  return { mode, cycle: () => cycleMode(mode, setMode, runSlash) };
}

export function ModeLine(props: { mode: Mode }): ReactElement | null {
  if (props.mode === "acceptEdits") return <Text bold>EDITS <Text>(shift+tab to cycle)</Text></Text>;
  if (props.mode === "auto") return <Text bold>AUTO <Text>(shift+tab to cycle)</Text></Text>;
  return null;
}
