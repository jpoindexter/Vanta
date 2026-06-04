import { type ReactElement } from "react";
import { Box, Text } from "ink";
import type { ApprovalMode } from "./approval-mode.js";

// The live status bar — the bottom readout that mirrors docs/hermes-model.html
// tab 4. Shows run state, active model, an estimated context fill (with a bar),
// and elapsed turn time. Cost and exact token usage are intentionally absent:
// Argo's providers don't surface usage data yet, so showing "$0.0021" would be
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
}): ReactElement {
  const { bar, pct } = progressBar(props.estTokens, props.contextWindow);
  const left = props.busy ? `${props.spinner} ${props.status}` : "● ready";
  const dur = props.busy ? ` · ${formatDuration(props.elapsedMs)}` : "";
  const modeTag = props.mode === "auto" ? <Text color="yellow"> ⚡auto</Text> : null;
  return (
    <Box width={props.width} justifyContent="space-between">
      <Text dimColor>
        <Text color={props.busy ? "yellow" : "cyan"}>{left}</Text>
        {` · ${props.model} · ~${formatCount(props.estTokens)}/${formatCount(props.contextWindow)} `}
        <Text color="cyan">{bar}</Text>
        {` ${pct}%${dur}`}
        {modeTag}
      </Text>
      <Text dimColor>{props.hint}</Text>
    </Box>
  );
}
