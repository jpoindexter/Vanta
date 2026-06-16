import { useEffect, useState, type ReactElement } from "react";
import { Text } from "ink";
import { useTheme } from "./theme.js";
import { envForPermissionMode, resolvePermissionMode, type PermissionMode } from "../modes/permission-mode.js";
import type { Pending } from "./use-agent.js";

export type Mode = PermissionMode;
const NEXT_MODE: Record<Mode, Mode> = { default: "acceptEdits", acceptEdits: "auto", auto: "default" };

export function cycleMode(mode: Mode, setMode: (m: Mode) => void, runSlash: (s: string) => void): void {
  const next = NEXT_MODE[mode];
  void runSlash;
  setMode(next);
}

function useAutoApprove(pending: Pending | null, mode: Mode, setPending: (p: Pending | null) => void): void {
  useEffect(() => {
    if (pending && mode === "auto") { pending.resolve(true); setPending(null); }
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
  const t = useTheme();
  if (props.mode === "acceptEdits") return <Text color={t.warning} bold>EDITS <Text dimColor={t.dimText}>(shift+tab to cycle)</Text></Text>;
  if (props.mode === "auto") return <Text color={t.warning} bold>AUTO <Text dimColor={t.dimText}>(shift+tab to cycle)</Text></Text>;
  return null;
}
