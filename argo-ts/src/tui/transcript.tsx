import { type ReactElement } from "react";
import { Box, Text } from "ink";

// Presentational layer for the TUI: the scrolling transcript (user / assistant
// / tool / note rows), the streaming buffer, and the slash-command palette.
// Pure render — all state lives in the App reducer.

export type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; args: string; ok?: boolean; output?: string }
  | { kind: "note"; text: string };

/** Compact a tool's args object to a single short line for the transcript. */
export const shortArgs = (a: Record<string, unknown>): string => {
  const s = JSON.stringify(a);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
};

/** First non-empty line of a tool result, truncated, for the inline result row. */
export const firstLine = (t: string): string => {
  const l = (t.split("\n")[0] ?? "").trim();
  return l.length > 80 ? `${l.slice(0, 77)}...` : l;
};

export function Transcript(props: { entries: Entry[]; streaming: string }): ReactElement {
  return (
    <Box flexDirection="column">
      {props.entries.map((e, i) => (
        <EntryLine key={i} entry={e} />
      ))}
      {props.streaming.trim() ? <Text>{props.streaming}</Text> : null}
    </Box>
  );
}

function EntryLine(props: { entry: Entry }): ReactElement {
  const e = props.entry;
  if (e.kind === "user") return <Text color="cyan">› {e.text}</Text>;
  if (e.kind === "assistant") return <Text>{e.text}</Text>;
  if (e.kind === "note") return <Text dimColor>  {e.text}</Text>;
  const mark = e.ok === undefined ? "→" : e.ok ? "✓" : "✗";
  const tail = e.output !== undefined ? `: ${e.output}` : `(${e.args})`;
  return (
    <Text dimColor>
      {"  "}
      {mark} {e.name}
      {tail}
    </Text>
  );
}

export function Palette(props: {
  matches: ReadonlyArray<{ name: string; arg?: string; desc: string }>;
  sel: number;
  width: number;
}): ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} width={props.width}>
      {props.matches.map((c, i) => {
        const active = i === props.sel;
        const label = `/${c.name}${c.arg ? ` ${c.arg}` : ""}`;
        return (
          <Box key={c.name} justifyContent="space-between">
            <Text color={active ? "cyan" : undefined} bold={active}>
              {active ? "› " : "  "}
              {label}
            </Text>
            <Text dimColor>{c.desc}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
