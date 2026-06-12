import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { diffStat, INLINE_MAX, FOLD_PREVIEW } from "./tool-result.js";
import { renderMarkdown } from "./markdown.js";
import { DiffView } from "./diff-view.js";
import { linkifyFilePaths } from "./osc8.js";
import { Banner, type BannerData } from "./banner.js";
import { GLYPHS } from "./figures.js";
import type { DiffLine } from "../util/diff.js";

// Presentational layer for the TUI: the scrolling transcript (user / assistant
// / tool / note rows), the streaming buffer, and the slash-command palette.
// Pure render — all state lives in the App reducer. Per-tool display parts
// (icon/verb/detail) are computed at dispatch time (tool-display.ts), so this
// layer never sees raw JSON args or temp paths.

export type ToolEntry = {
  kind: "tool";
  name: string;
  icon: string;
  verb: string;
  detail: string;
  ok?: boolean;
  /** First line of a FAILED result only — successes show nothing (output → model). */
  errorLine?: string;
  /** Magnitude of the result (`254 lines`) computed at dispatch — never the raw body. */
  summary?: string;
  /** Diff lines for write_file results — folded behind the expand toggle. */
  diff?: DiffLine[];
  /** Preview (up to FOLD_PREVIEW lines) — shown when expanded. */
  resultOutput?: string;
  /** Total line count of the result; controls inline vs. folded display. */
  lineCount?: number;
  /** True when this tool call directly follows another in the same turn. */
  isGrouped?: boolean;
};

/** The startup banner as a transcript entry — scrolls into history like any other.
 * `compact` renders the 4-line variant (alt-screen: the full card is taller
 * than the viewport and clips). */
export type BannerEntry = { kind: "banner"; data: BannerData; root?: string; compact?: boolean };

export type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | ToolEntry
  | { kind: "note"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "interrupted"; text: string }
  | { kind: "compactBoundary"; text: string }
  | BannerEntry;

/** First non-empty line of a tool result, truncated — used for error rows. */
export const firstLine = (t: string): string => {
  const l = (t.split("\n")[0] ?? "").trim();
  return l.length > 80 ? `${l.slice(0, 77)}...` : l;
};

/**
 * Render ONE committed transcript entry. The App renders these inside Ink's
 * <Static> so finished history commits to scrollback exactly once. Ink can only
 * clear lines still on screen, so a growing *dynamic* transcript leaves ghost
 * frames when the terminal is resized — committing history to Static is the fix.
 * Tool rows keep their one-space indent; everything else renders as before.
 */
export function EntryRow(props: { entry: Entry; expanded?: boolean }): ReactElement {
  const e = props.entry;
  if (e.kind === "banner") return <Banner data={e.data} root={e.root} compact={e.compact} />;
  if (e.kind === "tool") {
    return (
      <Box marginLeft={1}>
        {e.isGrouped ? <Text dimColor>│ </Text> : null}
        <ToolLine entry={e} expanded={props.expanded ?? false} />
      </Box>
    );
  }
  return <SingleLine entry={e} expanded={props.expanded ?? false} />;
}

function SingleLine(props: { entry: Exclude<Entry, ToolEntry | BannerEntry>; expanded?: boolean }): ReactElement {
  const e = props.entry;
  if (e.kind === "user") return <Text color="cyan">{GLYPHS.pointer} {linkifyFilePaths(e.text, process.cwd())}</Text>;
  if (e.kind === "assistant") return <Box><Text color="cyan">{GLYPHS.dot} </Text>{renderMarkdown(e.text)}</Box>;
  if (e.kind === "thinking") {
    if (props.expanded) {
      return <Text dimColor>  ⚙ {e.text}</Text>;
    }
    const preview = e.text.split("\n")[0] ?? "";
    const truncated = preview.length > 80 ? `${preview.slice(0, 77)}...` : preview;
    return <Text dimColor>  ⚙ {truncated}</Text>;
  }
  if (e.kind === "interrupted") return <Text color="yellow">  ⎋ {e.text}</Text>;
  if (e.kind === "compactBoundary") return <Text color="magenta">  ──── {GLYPHS.asterisk} {e.text} ────</Text>;
  return <Text dimColor>  {linkifyFilePaths(e.text, process.cwd())}</Text>;
}

function toolLineFlags(e: ToolEntry, expanded: boolean): {
  isLong: boolean; showOutput: boolean; showFoldHint: boolean; showDiff: boolean; extraLines: number;
} {
  const isLong = (e.lineCount ?? 0) > INLINE_MAX;
  const showOutput = e.ok === true && !!e.resultOutput && (!isLong || expanded);
  const showFoldHint = isLong && !expanded && !!e.resultOutput;
  const showDiff = expanded && e.ok === true && !!e.diff?.length;
  const extraLines = (e.lineCount ?? 0) - FOLD_PREVIEW;
  return { isLong, showOutput, showFoldHint, showDiff, extraLines };
}

function ToolOutputBlock(props: { resultOutput: string; extraLines: number }): ReactElement {
  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text dimColor>{props.resultOutput}</Text>
      {props.extraLines > 0 ? <Text dimColor>… +{props.extraLines} more lines</Text> : null}
    </Box>
  );
}

function ToolSummaryLine(props: {
  mark: string; icon: string; verb: string; tail: string;
  meta: string; showFoldHint: boolean; ok?: boolean; errorLine?: string;
}): ReactElement {
  const { mark, icon, verb, tail, meta, showFoldHint, ok, errorLine } = props;
  return (
    <Text dimColor>
      {mark} {icon} {verb}
      {tail}
      {meta ? <Text dimColor> · {meta}</Text> : null}
      {showFoldHint ? <Text dimColor> [^O output]</Text> : null}
      {ok === false && errorLine ? <Text color="red"> — {errorLine}</Text> : null}
    </Text>
  );
}

/**
 * One clean activity line: `<mark> <icon> <verb> <detail> · <meta>` (+ error
 * tail). The result magnitude (`254 lines` / `+12/-3`) shows by default; the full
 * diff is folded behind the expand toggle (Ctrl+O) so it never floods the feed.
 */
function ToolLine(props: { entry: ToolEntry; expanded: boolean }): ReactElement {
  const e = props.entry;
  const mark = e.ok === undefined ? "·" : e.ok ? "✓" : "✗";
  const tail = e.detail ? ` ${e.detail}` : "";
  const meta = e.ok ? diffStat(e.diff) || e.summary || "" : "";
  // Short outputs (≤ INLINE_MAX lines) always show; long outputs fold behind ^O.
  const { showOutput, showFoldHint, showDiff, extraLines } = toolLineFlags(e, props.expanded);
  return (
    <Box flexDirection="column">
      <ToolSummaryLine mark={mark} icon={e.icon} verb={e.verb} tail={tail}
        meta={meta} showFoldHint={showFoldHint} ok={e.ok} errorLine={e.errorLine} />
      {showOutput ? <ToolOutputBlock resultOutput={e.resultOutput!} extraLines={extraLines} /> : null}
      {showDiff ? <DiffView lines={e.diff!} /> : null}
    </Box>
  );
}

/** Truncate to a max width with an ellipsis — keeps rows on one line. */
export function clip(s: string, max: number): string {
  if (max <= 0) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function Palette(props: {
  matches: ReadonlyArray<{ name: string; arg?: string; desc: string; risk?: string }>;
  sel: number;
  width: number;
}): ReactElement {
  // Fixed command column: command name padded to a shared
  // width, then risk label, then one-line, width-clipped description.
  const labels = props.matches.map((c) => `/${c.name}${c.arg ? ` ${c.arg}` : ""}`);
  const cmdCol = Math.min(22, Math.max(2, ...labels.map((l) => l.length)) + 2);
  const riskCol = 11; // "[approval] " = 11 chars
  const descCol = Math.max(8, props.width - cmdCol - riskCol - 4); // 4 = border + gutter + marker
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} width={props.width}>
      {props.matches.map((c, i) => {
        const active = i === props.sel;
        const label = clip(labels[i] ?? "", cmdCol).padEnd(cmdCol);
        const riskLabel = c.risk ? c.risk.padEnd(riskCol) : "".padEnd(riskCol);
        return (
          <Box key={c.name}>
            <Text color={active ? "cyan" : "white"} bold={active}>
              {active ? "› " : "  "}
              {label}
            </Text>
            <Text color={active ? "cyan" : "gray"}>{riskLabel}</Text>
            <Text dimColor>{clip(c.desc, descCol)}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
