import { type ReactElement } from "react";
import { Box, Text } from "inkr";
import type { Entry } from "./types.js";

// Pure renderers for one committed entry. Each renders on ONE logical block;
// real Ink + <Static> commits it to scrollback once, so wrapping is fine (the
// terminal owns the wrapped lines — no ScrollBox height math, no ghosting).

export function EntryView(props: { entry: Entry }): ReactElement {
  const e = props.entry;
  if (e.kind === "user") return <Text color="cyan">❯ {e.text}</Text>;
  if (e.kind === "assistant") return <Box><Text color="cyan">⏺ </Text><Text>{e.text}</Text></Box>;
  if (e.kind === "thinking") return <Text dimColor>  ⚙ {firstLine(e.text)}</Text>;
  if (e.kind === "note") return <Text dimColor>{e.text}</Text>;
  return <ToolView entry={e} />;
}

function ToolView(props: { entry: Extract<Entry, { kind: "tool" }> }): ReactElement {
  const e = props.entry;
  const mark = e.ok === undefined ? "○" : e.ok ? "✓" : "✗";
  const markColor = e.ok === undefined ? "yellow" : e.ok ? "green" : "red";
  const meta = e.ok ? e.summary : e.errorLine;
  return (
    <Box>
      <Text color={markColor}>{mark} </Text>
      <Text dimColor>{e.verb}{e.detail ? ` ${e.detail}` : ""}</Text>
      {meta ? <Text dimColor> · {meta}</Text> : null}
    </Box>
  );
}

/** First line only — thinking previews stay one line in committed history. */
function firstLine(t: string): string {
  const l = (t.split("\n")[0] ?? "").trim();
  return l.length > 100 ? `${l.slice(0, 99)}…` : l;
}
