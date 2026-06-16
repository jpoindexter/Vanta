import type { ReactElement } from "react";
import { Box, Text } from "ink";
import { StatusBar } from "./status-bar.js";
import { StreamPreview } from "./stream-view.js";
import { useTheme } from "./theme.js";
import { busyLabel } from "./busy.js";
import type { PendingTool, Entry } from "./types.js";
import { Banner } from "./banner.js";
import { EntryView } from "./transcript.js";
import type { EffortLevel } from "../types.js";

function goalClip(s: string): string {
  const l = s.split("\n")[0] ?? "";
  return l.length > 88 ? `${l.slice(0, 87)}…` : l;
}

export function Footer(props: {
  model: string;
  effortLevel: EffortLevel;
  ctxPct: number;
  tokens: number;
  contextWindow: number;
  turns: number;
  busy: boolean;
  queued: number;
  goal: string | null;
  mcp: boolean;
  elapsed: string;
}): ReactElement {
  const t = useTheme();
  return (
    <Box flexDirection="column">
      <Text dimColor={t.dimText}>{props.goal ? <><Text color={t.accent}>◇</Text> {goalClip(props.goal)}</> : " "}</Text>
      <StatusBar model={props.model} effortLevel={props.effortLevel} ctxPct={props.ctxPct} tokens={props.tokens} contextWindow={props.contextWindow} turns={props.turns} busy={props.busy} queued={props.queued} elapsed={props.elapsed} mcp={props.mcp} />
      <Text dimColor={t.dimText}>  <Text color={t.accent}>/</Text> commands  ·  <Text color={t.accent}>@</Text> files  ·  <Text color={t.accent}>!</Text> shell  ·  <Text color={t.accent}>#</Text> memory</Text>
    </Box>
  );
}

export function LiveRegion(props: { streaming: string; activeTools: PendingTool[]; busy: boolean; tick: number }): ReactElement | null {
  const { streaming, activeTools, busy, tick } = props;
  const theme = useTheme();
  if (!busy && !streaming) return null;
  const active = activeTools[activeTools.length - 1];
  const { frame, verb } = busyLabel(tick);
  const label = active ? `${active.verb}${active.detail ? ` ${active.detail}` : ""}` : verb;
  const secs = Math.round(tick * 0.15);
  return (
    <Box flexDirection="column">
      {streaming ? <StreamPreview text={streaming} /> : null}
      {busy && !streaming ? <Text color={theme.accent}>{frame} <Text dimColor={theme.dimText}>{label}… ({secs}s · esc to interrupt)</Text></Text> : null}
    </Box>
  );
}

export function buildStaticItems(
  model: string,
  repoRoot: string,
  entries: Entry[],
  caps: { tools: number; cmds: number },
): Array<{ key: string; node: ReactElement }> {
  return [
    { key: "banner", node: <Banner model={model} cwd={repoRoot} kernel="127.0.0.1:7788" tools={caps.tools} cmds={caps.cmds} /> },
    ...entries.map((e, i) => ({ key: `e${i}`, node: <EntryView entry={e} /> })),
  ];
}
