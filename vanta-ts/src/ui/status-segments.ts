import { contextBar } from "./busy.js";
import { formatPrUrl } from "../settings/git-settings.js";

// Pure formatters for the rich status-line segments + a composer that assembles
// only the segments whose data is present. Each formatter returns "" when its
// data is unavailable so the composer can omit it cleanly (no fabrication).
// Rendering/color lives in status-bar.tsx; this module is text-only and pure.

/** Rate-limit utilization, when the provider exposes it. Absent = omit the segment. */
export type RateLimit = {
  /** 5-hour window utilization, 0..100. */
  pct5h: number;
  /** 7-day window utilization, 0..100. */
  pct7d: number;
  /** ISO timestamp the active window resets, when known. */
  resetsAt?: string;
};

/** Working-tree line delta vs HEAD. */
export type LineDelta = { added: number; removed: number };

const NAME_MAX = 24;
const CUSTOM_MAX = 40;

function clamp(pct: number): number {
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** Compact reset hint: " ↻12:30" local time, or "" when unknown/invalid. */
export function resetHint(resetsAt: string | undefined): string {
  if (!resetsAt) return "";
  const t = Date.parse(resetsAt);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return ` ↻${hh}:${mm}`;
}

/**
 * Rate-limit utilization bars: "5h [██░░░░] 22% · 7d [█░░░░░] 9% ↻12:30".
 * Returns "" when no rate-limit data is available (the common case today —
 * no provider exposes it, so the segment is omitted rather than faked).
 */
export function rateLimitText(rl: RateLimit | undefined): string {
  if (!rl) return "";
  const p5 = clamp(rl.pct5h);
  const p7 = clamp(rl.pct7d);
  return `5h [${contextBar(p5, 6)}] ${p5}% · 7d [${contextBar(p7, 6)}] ${p7}%${resetHint(rl.resetsAt)}`;
}

/** Session lines delta: "+42/-7". "" when there are no changes (omit segment). */
export function lineDeltaText(d: LineDelta | undefined): string {
  if (!d || (d.added === 0 && d.removed === 0)) return "";
  return `+${d.added}/-${d.removed}`;
}

/** Session name (e.g. /rename), clipped. "" when unset (omit segment). */
export function sessionNameText(name: string | undefined): string {
  const n = name?.trim();
  if (!n) return "";
  return n.length > NAME_MAX ? `${n.slice(0, NAME_MAX - 1)}…` : n;
}

/** Worktree indicator. "" when not in a linked worktree (omit segment). */
export function worktreeText(isWorktree: boolean | undefined): string {
  return isWorktree ? "⑂ worktree" : "";
}

/** Vim-mode indicator. "" when vi-mode is off (omit segment). */
export function vimText(vimEnabled: boolean | undefined): string {
  return vimEnabled ? "vim" : "";
}

/**
 * PR link segment: the active PR rendered through settings.prUrlTemplate (the
 * `{PR}` placeholder → the number). "" when there is no active PR or no template
 * (the default — no PR segment in the footer). Pure.
 */
export function prText(prNumber: number | undefined, template: string | undefined): string {
  if (prNumber === undefined || !template?.trim()) return "";
  return formatPrUrl(template.trim(), prNumber);
}

/** A hook-contributed custom segment, trimmed/clipped. "" when none. */
export function customText(custom: string | undefined): string {
  const c = custom?.replace(/\s+/g, " ").trim();
  if (!c) return "";
  return c.length > CUSTOM_MAX ? `${c.slice(0, CUSTOM_MAX - 1)}…` : c;
}

export function outputStyleText(style: string | undefined): string {
  const s = style?.trim();
  if (!s || s === "normal") return "";
  return `style:${s.length > 18 ? `${s.slice(0, 17)}…` : s}`;
}

export type RichInput = {
  rateLimit?: RateLimit;
  lineDelta?: LineDelta;
  sessionName?: string;
  isWorktree?: boolean;
  vimEnabled?: boolean;
  custom?: string;
  outputStyle?: string;
  /** Active PR number; rendered via prUrlTemplate. Absent → no PR segment. */
  prNumber?: number;
  /** settings.prUrlTemplate; `{PR}` → the number. Absent → no PR segment. */
  prUrlTemplate?: string;
};

/** A status segment keyed by role so the renderer can color/skip it. */
export type RichSegment = { key: string; text: string; priority: number };

const SEP = "  ·  ";

/**
 * Compose the present rich segments in display order, each separated by " · "
 * and tagged with a drop priority (lower = dropped first as the line narrows).
 * Absent data yields no segment. Pure — no I/O, fully unit-testable.
 */
export function composeRichSegments(input: RichInput): RichSegment[] {
  const out: RichSegment[] = [];
  const push = (key: string, text: string, priority: number): void => {
    if (text) out.push({ key, text: `${SEP}${text}`, priority });
  };
  push("rate", rateLimitText(input.rateLimit), 6);
  push("delta", lineDeltaText(input.lineDelta), 5);
  push("name", sessionNameText(input.sessionName), 4);
  push("worktree", worktreeText(input.isWorktree), 4);
  push("vim", vimText(input.vimEnabled), 3);
  push("pr", prText(input.prNumber, input.prUrlTemplate), 3);
  push("style", outputStyleText(input.outputStyle), 3);
  push("custom", customText(input.custom), 2);
  return out;
}
