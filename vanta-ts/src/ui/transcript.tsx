import { type ReactElement } from "react";
import { Box, Text, useStdout } from "ink";
import { Markdown } from "./markdown.js";
import { linkify } from "../term/linkify.js";
import { hasRtl, reorderBidi } from "../term/bidi.js";
import { FOCUS, RISK } from "../term/palette.js";
import type { Entry, ToolEntry } from "./types.js";
import type { DiffLine } from "../util/diff.js";

// Pure renderers for one committed entry. Tools render Claude-style: each call is
// a ⏺ Verb(detail) line over a dim ⎿ result line (+ inline diff for edits). Real
// Ink + <Static> commits each entry to scrollback once, so wrapping is fine (the
// terminal owns the wrapped lines).

// Bidi seam: the renderer (and the terminal grid) lay glyphs L→R, so logical-order
// RTL text (Hebrew/Arabic) shows backwards. `vbidi` reorders it into visual order
// ONLY when a strong-RTL char is present — pure-LTR text is returned byte-identical,
// so the common case is untouched. Applied to user/assistant/note prose.
const vbidi = (text: string): string => (hasRtl(text) ? reorderBidi(text) : text);

const DIFF_MAX = 12;
const THINK_MAX = 3;

export function EntryView(props: { entry: Entry }): ReactElement {
  const e = props.entry;
  // Wrap prose to (cols − marker). An explicit width is needed because the `⏺ `/`❯ `
  // markers are ambiguous-width glyphs the terminal renders wider than Ink measures —
  // flexGrow alone leaves the text 1–2 cols too wide, so it overflows and the terminal
  // re-wraps the spillover (mangled "als↵o"). Reserve 3 cells; clamp to a sane floor.
  const cols = useStdout().stdout?.columns ?? 100;
  const proseWidth = Math.max(20, cols - 3);
  // A blank line above a user turn separates turns visually (Claude/Cursor rhythm).
  // flexGrow on the text column makes Ink wrap to (terminalWidth − marker) instead
  // of the full width — without it, marker + full-width text overflows by the marker
  // size and the terminal re-wraps the spillover (the mangled "als↵o" wrap bug).
  if (e.kind === "user") return <Box marginTop={1}><Text bold color={FOCUS}>❯ </Text><Box width={proseWidth}><Text>{vbidi(e.text)}</Text></Box></Box>;
  if (e.kind === "assistant") return <Box marginTop={1}><Text>⏺ </Text><Box flexDirection="column" width={proseWidth}><Markdown text={vbidi(e.text)} /></Box></Box>;
  if (e.kind === "thinking") return <ThinkingView text={e.text} />;
  if (e.kind === "note") return <NoteView text={e.text} />;
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
  const ok = e.ok !== false;
  const meta = ok ? e.summary : e.errorLine;
  const head = `${cap(e.verb)}${e.detail ? `(${e.detail})` : ""}`;
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={ok ? FOCUS : RISK}>⏺ </Text>
        <Text>{head}</Text>
      </Box>
      {meta ? <Text color={ok ? undefined : RISK}>{"  ⎿  "}{clip(meta, 92)}</Text> : null}
      {e.diff && e.diff.length > 0 ? <DiffView diff={e.diff} /> : null}
    </Box>
  );
}

/** A committed note (system/EF nudge, tool tail) with clickable links. `linkify`
 * wraps URLs + file:line refs in OSC-8 (skipping fenced code), and degrades to
 * plain text on terminals without hyperlink support. */
function NoteView(props: { text: string }): ReactElement {
  const lines = linkify(vbidi(props.text)).split("\n");
  return (
    <Box flexDirection="column" marginTop={1}>
      {lines.map((l, i) => <Text key={i}>{l}</Text>)}
    </Box>
  );
}

function ThinkingView(props: { text: string }): ReactElement {
  const lines = props.text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, THINK_MAX);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>✻ thinking</Text>
      {lines.map((l, i) => <Text key={i}>  {clip(l, 100)}</Text>)}
    </Box>
  );
}

function DiffView(props: { diff: DiffLine[] }): ReactElement {
  const shown = props.diff.slice(0, DIFF_MAX);
  const extra = props.diff.length - shown.length;
  return (
    <Box flexDirection="column">
      {shown.map((d, i) => <DiffRow key={i} line={d} />)}
      {extra > 0 ? <Text>     … {extra} more line{extra === 1 ? "" : "s"}</Text> : null}
    </Box>
  );
}

function DiffRow(props: { line: DiffLine }): ReactElement {
  const { line } = props;
  if (line.type === "add") return <Text>     + {clip(line.text, 96)}</Text>;
  if (line.type === "remove") return <Text>     - {clip(line.text, 96)}</Text>;
  return <Text>       {clip(line.text, 96)}</Text>;
}

/** Clip to one line of at most `max` chars. */
function clip(t: string, max: number): string {
  const l = (t.split("\n")[0] ?? "").trimEnd();
  return l.length > max ? `${l.slice(0, max - 1)}…` : l;
}
