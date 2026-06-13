import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { useTheme } from "./theme.js";
import { Markdown } from "./markdown.js";
import type { Entry, ToolEntry } from "./types.js";
import type { DiffLine } from "../util/diff.js";

// Pure renderers for one committed entry. Tools render Claude-style: each call is
// a ⏺ Verb(detail) line over a dim ⎿ result line (+ inline diff for edits). Real
// Ink + <Static> commits each entry to scrollback once, so wrapping is fine (the
// terminal owns the wrapped lines).

const DIFF_MAX = 12;
const THINK_MAX = 3;

export function EntryView(props: { entry: Entry }): ReactElement {
  const e = props.entry;
  const t = useTheme();
  // A blank line above a user turn separates turns visually (Claude/Cursor rhythm).
  if (e.kind === "user") return <Box marginTop={1}><Text color={t.userMarker} bold>❯ </Text><Text color={t.userMarker}>{e.text}</Text></Box>;
  if (e.kind === "assistant") return <Box marginTop={1}><Text color={t.marker}>⏺ </Text><Box flexDirection="column"><Markdown text={e.text} /></Box></Box>;
  if (e.kind === "thinking") return <ThinkingView text={e.text} />;
  if (e.kind === "note") return <Box marginTop={1}><Text dimColor={t.dimText}>{e.text}</Text></Box>;
  if (e.kind === "toolGroup") return <ToolGroupView tools={e.tools} />;
  return <ToolCallView entry={e} />;
}

/** Capitalize a verb for the Claude-style call header ("read" → "Read"). */
const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** A committed run of tools, Claude-style: each is a ⏺ Verb(detail) line over a
 * dim ⎿ result line (+ inline diff for edits) — sequential pairs, no group header. */
function ToolGroupView(props: { tools: ToolEntry[] }): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      {props.tools.map((tool, i) => <ToolCallView key={i} entry={tool} />)}
    </Box>
  );
}

function ToolCallView(props: { entry: ToolEntry }): ReactElement {
  const e = props.entry;
  const t = useTheme();
  const ok = e.ok !== false;
  const meta = ok ? e.summary : e.errorLine;
  const head = `${cap(e.verb)}${e.detail ? `(${e.detail})` : ""}`;
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={ok ? t.success : t.error}>⏺ </Text>
        <Text color={t.primary}>{head}</Text>
      </Box>
      {meta ? <Text dimColor={t.dimText}>{"  ⎿  "}{clip(meta, 92)}</Text> : null}
      {e.diff && e.diff.length > 0 ? <DiffView diff={e.diff} /> : null}
    </Box>
  );
}

function ThinkingView(props: { text: string }): ReactElement {
  const t = useTheme();
  const lines = props.text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, THINK_MAX);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor={t.dimText}>✻ thinking</Text>
      {lines.map((l, i) => <Text key={i} dimColor={t.dimText}>  {clip(l, 100)}</Text>)}
    </Box>
  );
}

function DiffView(props: { diff: DiffLine[] }): ReactElement {
  const t = useTheme();
  const shown = props.diff.slice(0, DIFF_MAX);
  const extra = props.diff.length - shown.length;
  return (
    <Box flexDirection="column">
      {shown.map((d, i) => <DiffRow key={i} line={d} />)}
      {extra > 0 ? <Text dimColor={t.dimText}>     … {extra} more line{extra === 1 ? "" : "s"}</Text> : null}
    </Box>
  );
}

function DiffRow(props: { line: DiffLine }): ReactElement {
  const { line } = props;
  const t = useTheme();
  if (line.type === "add") return <Text color={t.success}>     + {clip(line.text, 96)}</Text>;
  if (line.type === "remove") return <Text color={t.error}>     - {clip(line.text, 96)}</Text>;
  return <Text dimColor={t.dimText}>       {clip(line.text, 96)}</Text>;
}

/** Clip to one line of at most `max` chars. */
function clip(t: string, max: number): string {
  const l = (t.split("\n")[0] ?? "").trimEnd();
  return l.length > max ? `${l.slice(0, max - 1)}…` : l;
}
