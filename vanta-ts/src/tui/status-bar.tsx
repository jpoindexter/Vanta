import { type ReactElement } from "react";
import { Box, Text } from "ink";
import type { ApprovalMode } from "./approval-mode.js";

// The live status bar — the bottom readout. Shows run state, active model, an estimated context fill (with a bar),
// and elapsed turn time. Cost and exact token usage are intentionally absent:
// Vanta's providers don't surface usage data yet, so showing "$0.0021" would be
// invented precision. Tokens are an estimate, marked with a leading ~.

const BAR_WIDTH = 8;
const CHARS_PER_TOKEN = 4; // rough heuristic; real usage data is a later upgrade

/** Estimate context tokens from transcript size (~4 chars/token). */
export function estimateTokens(messages: ReadonlyArray<{ content?: string }>, streaming = ""): number {
  let chars = streaming.length;
  for (const m of messages) chars += (m.content ?? "").length;
  return Math.round(chars / CHARS_PER_TOKEN);
}

/** Compact human count: 38000 → "38k", 1_000_000 → "1.0M". */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function progressBar(used: number, total: number, width = BAR_WIDTH): { bar: string; pct: number } {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const filled = Math.min(width, Math.round((pct / 100) * width));
  return { bar: `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`, pct };
}

/** ms → "m:ss". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// CC-TOKEN-WARN-UI: warn when the conversation is approaching the context limit
// so the user can /compact or /new before a turn overflows. Thresholds are
// fractions of the context window, configurable via env.
export type TokenWarnLevel = "none" | "warn" | "urgent";
const DEFAULT_WARN_FRAC = 0.85;
const DEFAULT_URGENT_FRAC = 0.95;

/** Read configurable warn/urgent fractions (VANTA_TOKEN_WARN_FRAC / _URGENT_FRAC). */
export function tokenWarnFractions(env: NodeJS.ProcessEnv): { warn: number; urgent: number } {
  const w = Number(env.VANTA_TOKEN_WARN_FRAC);
  const u = Number(env.VANTA_TOKEN_URGENT_FRAC);
  return {
    warn: w > 0 && w < 1 ? w : DEFAULT_WARN_FRAC,
    urgent: u > 0 && u <= 1 ? u : DEFAULT_URGENT_FRAC,
  };
}

/** Classify context fill into a warning level. Pure (env read at call time, not module load). */
export function tokenWarningLevel(
  estTokens: number,
  contextWindow: number,
  env: NodeJS.ProcessEnv = process.env,
): TokenWarnLevel {
  if (contextWindow <= 0) return "none";
  const frac = estTokens / contextWindow;
  const { warn, urgent } = tokenWarnFractions(env);
  if (frac >= urgent) return "urgent";
  if (frac >= warn) return "warn";
  return "none";
}

/** Map a warn level to status-bar styling (pure; keeps StatusBar's branching low). */
export function tokenWarnDecor(level: TokenWarnLevel): { pctColor?: string; tagColor?: string; tagText?: string } {
  if (level === "urgent") return { pctColor: "red", tagColor: "red", tagText: " ■ context full · /compact" };
  if (level === "warn") return { pctColor: "yellow", tagColor: "yellow", tagText: " ▲ /compact" };
  return {};
}

export function StatusBar(props: {
  status: string;
  busy: boolean;
  spinner: string;
  model: string;
  estTokens: number;
  contextWindow: number;
  elapsedMs: number;
  width: number;
  hint: string;
  mode?: ApprovalMode;
  primaryColor?: string;
  vimMode?: "normal" | "insert";
}): ReactElement {
  const { bar, pct } = progressBar(props.estTokens, props.contextWindow);
  const color = props.primaryColor ?? "cyan";
  const left = props.busy ? `${props.spinner} ${props.status}` : "● ready";
  const dur = props.busy ? ` · ${formatDuration(props.elapsedMs)}` : "";
  // Context-limit warning: color the left % and, when high, REPLACE the right-side
  // hint with a /compact nudge — so the line never grows wider (an unexpected
  // status-line wrap is the overflow class behind the alt-screen ghost frames).
  const decor = tokenWarnDecor(tokenWarningLevel(props.estTokens, props.contextWindow));
  const right = decor.tagText
    ? <Text color={decor.tagColor}>{decor.tagText.trim()}</Text>
    : <Text dimColor>{props.hint}</Text>;
  const modeTag =
    props.mode === "auto" ? <Text color="yellow"> ⚡auto</Text> :
    props.mode === "accept-edits" ? <Text color="cyan"> ✎edits</Text> :
    null;
  const vimTag = props.vimMode ? <Text color={color}> [{props.vimMode === "normal" ? "N" : "I"}]</Text> : null;
  return (
    <Box width={props.width} justifyContent="space-between">
      <Text dimColor>
        <Text color={props.busy ? "yellow" : color}>{left}</Text>
        {` · ${props.model} · ~${formatCount(props.estTokens)}/${formatCount(props.contextWindow)} `}
        <Text color={color}>{bar}</Text>
        {" "}
        <Text color={decor.pctColor}>{pct}%</Text>
        {dur}
        {modeTag}
        {vimTag}
      </Text>
      {right}
    </Box>
  );
}
