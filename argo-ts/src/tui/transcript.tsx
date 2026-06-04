import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { partitionBlocks } from "./tool-display.js";
import { renderMarkdown } from "./markdown.js";
import { DiffView } from "./diff-view.js";
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
  /** Diff lines for write_file results — shown inline after the tool line. */
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

export function Transcript(props: { entries: Entry[]; streaming: string }): ReactElement {
  const blocks = partitionBlocks(props.entries);
  return (
    <Box flexDirection="column">
      {blocks.map((b, i) =>
        b.type === "tools" ? (
          <Box key={i} flexDirection="column" marginLeft={1}>
            {b.items.map((t, j) => (
              <ToolLine key={j} entry={t} />
            ))}
          </Box>
        ) : (
          <SingleLine key={i} entry={b.entry} />
        ),
      )}
      {props.streaming.trim() ? <Text>{props.streaming}</Text> : null}
      {/* Streaming is rendered as plain text (content is incomplete); committed
          assistant entries get full markdown rendering above via SingleLine. */}
    </Box>
  );
}

function SingleLine(props: { entry: Exclude<Entry, ToolEntry> }): ReactElement {
  const e = props.entry;
  if (e.kind === "user") return <Text color="cyan">› {e.text}</Text>;
  if (e.kind === "assistant") return renderMarkdown(e.text);
  if (e.kind === "thinking") {
    const preview = e.text.split("\n")[0] ?? "";
    const truncated = preview.length > 80 ? `${preview.slice(0, 77)}...` : preview;
    return <Text dimColor>  ⚙ {truncated}</Text>;
  }
  return <Text dimColor>  {e.text}</Text>;
}

/** One clean activity line: `<mark> <icon> <verb> <detail>` (+ error tail + diff). */
function ToolLine(props: { entry: ToolEntry }): ReactElement {
  const e = props.entry;
  const mark = e.ok === undefined ? "·" : e.ok ? "✓" : "✗";
  const tail = e.detail ? ` ${e.detail}` : "";
  return (
    <Box flexDirection="column">
      <Text dimColor>
        {mark} {e.icon} {e.verb}
        {tail}
        {e.ok === false && e.errorLine ? <Text color="red"> — {e.errorLine}</Text> : null}
      </Text>
      {e.ok && e.diff?.length ? <DiffView lines={e.diff} /> : null}
    </Box>
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
