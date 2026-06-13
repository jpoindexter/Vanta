import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { useTheme } from "./theme.js";
import { Markdown } from "./markdown.js";
import { kfmt } from "./busy.js";
import type { Entry, ToolEntry } from "./types.js";
import type { DiffLine } from "../util/diff.js";

// Pure renderers for one committed entry. Each renders one logical block; real
// Ink + <Static> commits it to scrollback once, so wrapping is fine (the terminal
// owns the wrapped lines). A run of tools commits as one toolGroup: a ⏺ header
// (the distinct verbs + an action count) over dim, indented per-tool detail rows;
// a tool that edited a file shows its diff inline beneath its row.

const DIFF_MAX = 12;
const THINK_MAX = 3;

export function EntryView(props: { entry: Entry }): ReactElement {
  const e = props.entry;
  const t = useTheme();
  // A blank line above a user turn separates turns visually (Claude/Cursor rhythm).
  if (e.kind === "user") return <Box marginTop={1}><Text color={t.userMarker} bold>❯ </Text><Text color={t.userMarker}>{e.text}</Text></Box>;
  if (e.kind === "assistant") return <Box><Text color={t.marker}>⏺ </Text><Box flexDirection="column"><Markdown text={e.text} /></Box></Box>;
  if (e.kind === "thinking") return <ThinkingView text={e.text} />;
  if (e.kind === "note") return <Text dimColor={t.dimText}>{e.text}</Text>;
  if (e.kind === "toolGroup") return <ToolGroupView tools={e.tools} />;
  return <ToolView entry={e} />;
}

/** Distinct verbs of a tool run, in first-seen order ("Read, wrote, ran"). */
function groupVerbs(tools: ToolEntry[]): string {
  const seen: string[] = [];
  for (const x of tools) if (!seen.includes(x.verb)) seen.push(x.verb);
  return seen.join(", ");
}

function ToolGroupView(props: { tools: ToolEntry[] }): ReactElement {
  const t = useTheme();
  const n = props.tools.length;
  const allOk = props.tools.every((x) => x.ok !== false);
  const tokSum = props.tools.reduce((acc, x) => acc + (x.tokens ?? 0), 0);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={allOk ? t.success : t.error}>⏺ </Text>
        <Text bold color={t.primary}>{groupVerbs(props.tools)}</Text>
        <Text dimColor={t.dimText}> · {n} action{n === 1 ? "" : "s"}</Text>
        {tokSum > 0 ? <Text dimColor={t.dimText}> · ~{kfmt(tokSum)} tok</Text> : null}
      </Box>
      {props.tools.map((tool, i) => <ToolDetailRow key={i} entry={tool} />)}
    </Box>
  );
}

function ToolDetailRow(props: { entry: ToolEntry }): ReactElement {
  const e = props.entry;
  const t = useTheme();
  const ok = e.ok !== false;
  const meta = ok ? e.summary : e.errorLine;
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={ok ? t.success : t.error}>  {ok ? "✓" : "✗"} </Text>
        <Text dimColor={t.dimText}>{e.verb}{e.detail ? ` ${e.detail}` : ""}{meta ? ` · ${meta}` : ""}</Text>
      </Box>
      {e.diff && e.diff.length > 0 ? <DiffView diff={e.diff} /> : null}
    </Box>
  );
}

function ThinkingView(props: { text: string }): ReactElement {
  const t = useTheme();
  const lines = props.text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, THINK_MAX);
  return (
    <Box flexDirection="column">
      <Text dimColor={t.dimText}>✻ thinking</Text>
      {lines.map((l, i) => <Text key={i} dimColor={t.dimText}>  {clip(l, 100)}</Text>)}
    </Box>
  );
}

function ToolView(props: { entry: ToolEntry }): ReactElement {
  const e = props.entry;
  const t = useTheme();
  const mark = e.ok === undefined ? "○" : e.ok ? "✓" : "✗";
  const markColor = e.ok === undefined ? t.warning : e.ok ? t.success : t.error;
  const meta = e.ok ? e.summary : e.errorLine;
  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor={t.dimText}>  ⎿ </Text>
        <Text color={markColor}>{mark} </Text>
        <Text dimColor={t.dimText}>{e.verb}{e.detail ? ` ${e.detail}` : ""}</Text>
        {meta ? <Text dimColor={t.dimText}> · {meta}</Text> : null}
      </Box>
      {e.diff && e.diff.length > 0 ? <DiffView diff={e.diff} /> : null}
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
