import { type ReactElement } from "react";
import { Box, Text } from "inkr";
import type { Entry, ToolEntry } from "./types.js";
import type { DiffLine } from "../util/diff.js";

// Pure renderers for one committed entry. Each renders one logical block; real
// Ink + <Static> commits it to scrollback once, so wrapping is fine (the terminal
// owns the wrapped lines). Tool rows hang under the turn with a ⎿ tree gutter
// (Claude/Cursor style), so a run of tools reads as one grouped block; a tool
// that edited a file shows its diff inline beneath it.

const DIFF_MAX = 12;
const THINK_MAX = 3;

export function EntryView(props: { entry: Entry }): ReactElement {
  const e = props.entry;
  if (e.kind === "user") return <Text color="cyan">❯ {e.text}</Text>;
  if (e.kind === "assistant") return <Box><Text color="cyan">⏺ </Text><Text>{e.text}</Text></Box>;
  if (e.kind === "thinking") return <ThinkingView text={e.text} />;
  if (e.kind === "note") return <Text dimColor>{e.text}</Text>;
  return <ToolView entry={e} />;
}

function ThinkingView(props: { text: string }): ReactElement {
  const lines = props.text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, THINK_MAX);
  return (
    <Box flexDirection="column">
      <Text dimColor>✻ thinking</Text>
      {lines.map((l, i) => <Text key={i} dimColor>  {clip(l, 100)}</Text>)}
    </Box>
  );
}

function ToolView(props: { entry: ToolEntry }): ReactElement {
  const e = props.entry;
  const mark = e.ok === undefined ? "○" : e.ok ? "✓" : "✗";
  const markColor = e.ok === undefined ? "yellow" : e.ok ? "green" : "red";
  const meta = e.ok ? e.summary : e.errorLine;
  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>  ⎿ </Text>
        <Text color={markColor}>{mark} </Text>
        <Text dimColor>{e.verb}{e.detail ? ` ${e.detail}` : ""}</Text>
        {meta ? <Text dimColor> · {meta}</Text> : null}
      </Box>
      {e.diff && e.diff.length > 0 ? <DiffView diff={e.diff} /> : null}
    </Box>
  );
}

function DiffView(props: { diff: DiffLine[] }): ReactElement {
  const shown = props.diff.slice(0, DIFF_MAX);
  const extra = props.diff.length - shown.length;
  return (
    <Box flexDirection="column">
      {shown.map((d, i) => <DiffRow key={i} line={d} />)}
      {extra > 0 ? <Text dimColor>     … {extra} more line{extra === 1 ? "" : "s"}</Text> : null}
    </Box>
  );
}

function DiffRow(props: { line: DiffLine }): ReactElement {
  const { line } = props;
  if (line.type === "add") return <Text color="green">     + {clip(line.text, 96)}</Text>;
  if (line.type === "remove") return <Text color="red">     - {clip(line.text, 96)}</Text>;
  return <Text dimColor>       {clip(line.text, 96)}</Text>;
}

/** Clip to one line of at most `max` chars. */
function clip(t: string, max: number): string {
  const l = (t.split("\n")[0] ?? "").trimEnd();
  return l.length > max ? `${l.slice(0, max - 1)}…` : l;
}
