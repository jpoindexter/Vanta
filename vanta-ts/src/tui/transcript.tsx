import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { diffStat } from "./tool-result.js";
import { renderMarkdown } from "./markdown.js";
import { DiffView } from "./diff-view.js";
import { linkifyFilePaths } from "./osc8.js";
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
};

export type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | ToolEntry
  | { kind: "note"; text: string }
  | { kind: "thinking"; text: string };

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
  if (e.kind === "tool") {
    return (
      <Box marginLeft={1}>
        <ToolLine entry={e} expanded={props.expanded ?? false} />
      </Box>
    );
  }
  return <SingleLine entry={e} expanded={props.expanded ?? false} />;
}

function SingleLine(props: { entry: Exclude<Entry, ToolEntry>; expanded?: boolean }): ReactElement {
  const e = props.entry;
  if (e.kind === "user") return <Text color="cyan">› {linkifyFilePaths(e.text, process.cwd())}</Text>;
  if (e.kind === "assistant") return renderMarkdown(e.text);
  if (e.kind === "thinking") {
    if (props.expanded) {
      return <Text dimColor>  ⚙ {e.text}</Text>;
    }
    const preview = e.text.split("\n")[0] ?? "";
    const truncated = preview.length > 80 ? `${preview.slice(0, 77)}...` : preview;
    return <Text dimColor>  ⚙ {truncated}</Text>;
  }
  return <Text dimColor>  {linkifyFilePaths(e.text, process.cwd())}</Text>;
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
  return (
    <Box flexDirection="column">
      <Text dimColor>
        {mark} {e.icon} {e.verb}
        {tail}
        {meta ? <Text dimColor> · {meta}</Text> : null}
        {e.ok === false && e.errorLine ? <Text color="red"> — {e.errorLine}</Text> : null}
      </Text>
      {props.expanded && e.ok && e.diff?.length ? <DiffView lines={e.diff} /> : null}
    </Box>
  );
}

/** Truncate to a max width with an ellipsis — keeps rows on one line. */
export function clip(s: string, max: number): string {
  if (max <= 0) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function Palette(props: {
  matches: ReadonlyArray<{ name: string; arg?: string; desc: string }>;
  sel: number;
  width: number;
}): ReactElement {
  // Fixed command column (Claude-CLI style): the command name padded to a shared
  // width, then a single-line, width-clipped description. No space-between — that
  // floats descriptions to ragged right edges and reads as broken.
  const labels = props.matches.map((c) => `/${c.name}${c.arg ? ` ${c.arg}` : ""}`);
  const cmdCol = Math.min(22, Math.max(2, ...labels.map((l) => l.length)) + 2);
  const descCol = Math.max(8, props.width - cmdCol - 4); // 4 = border + gutter + marker
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} width={props.width}>
      {props.matches.map((c, i) => {
        const active = i === props.sel;
        const label = clip(labels[i] ?? "", cmdCol).padEnd(cmdCol);
        return (
          <Box key={c.name}>
            <Text color={active ? "cyan" : "white"} bold={active}>
              {active ? "› " : "  "}
              {label}
            </Text>
            <Text dimColor>{clip(c.desc, descCol)}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
