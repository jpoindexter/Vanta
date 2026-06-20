import { useMemo, useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import {
  searchSessions,
  type SearchableSession,
  type SessionSearchHit,
} from "../search/cross-session.js";

// VANTA-GLOBAL-SEARCH-UI — the cross-session search dialog. A query input over a
// ranked result list: each row shows the matched snippet plus its session
// context (title + message index). Lives in the live region (not <Static>), so
// it disappears on close. Ranking is the pure searchSessions; this component
// only drives input + selection. Sessions are injected (a prop), so the render
// test uses fixtures with no fs.

const RESULT_LIMIT = 10;
const TITLE_MAX = 28;

/** Clip a session title for the context column. */
function clipTitle(title: string): string {
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

/** A printable character (not a chord) that should append to the query. */
function isTypable(input: string, key: { ctrl: boolean; meta: boolean }): boolean {
  return Boolean(input) && !key.ctrl && !key.meta;
}

/** Fire onSelect for the highlighted result, if there is one. */
function selectHit(
  results: SessionSearchHit[],
  index: number,
  onSelect: (hit: SessionSearchHit) => void,
): void {
  const hit = results[index];
  if (hit) onSelect(hit);
}

export function GlobalSearchDialog(props: {
  sessions: SearchableSession[];
  now?: number;
  onSelect: (hit: SessionSearchHit) => void;
  onClose: () => void;
}): ReactElement {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);

  const results = useMemo(
    () => searchSessions(query, props.sessions, props.now).slice(0, RESULT_LIMIT),
    [query, props.sessions, props.now],
  );
  const clamped = Math.min(sel, Math.max(0, results.length - 1));

  const onType = (next: string): void => {
    setQuery(next);
    setSel(0);
  };
  useInput((input, key) => {
    if (key.escape) return void props.onClose();
    if (key.return) return void selectHit(results, clamped, props.onSelect);
    if (key.upArrow) return void setSel((s) => Math.max(0, s - 1));
    if (key.downArrow) return void setSel((s) => Math.min(results.length - 1, s + 1));
    if (key.backspace || key.delete) return void onType(query.slice(0, -1));
    if (isTypable(input, key)) onType(query + input);
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>
        Search all sessions ·{" "}
        {query ? query : <Text dimColor>type to search every stored session</Text>}
      </Text>
      <ResultList results={results} active={clamped} query={query} />
      <Text dimColor>  ↑/↓ select · ⏎ open · Esc close</Text>
    </Box>
  );
}

function ResultList(props: {
  results: SessionSearchHit[];
  active: number;
  query: string;
}): ReactElement {
  if (props.results.length === 0) {
    return <Text dimColor>  {props.query ? "no matches" : "no sessions searched yet"}</Text>;
  }
  return (
    <Box flexDirection="column">
      {props.results.map((r, i) => (
        <ResultRow
          key={`${r.sessionId}:${r.messageIndex}`}
          hit={r}
          active={i === props.active}
        />
      ))}
    </Box>
  );
}

function ResultRow(props: { hit: SessionSearchHit; active: boolean }): ReactElement {
  const { hit, active } = props;
  return (
    <Box flexDirection="column">
      <Box>
        <Text>{active ? "❯ " : "  "}</Text>
        <Text inverse={active}>{clipTitle(hit.title)}</Text>
        <Text dimColor> · msg {hit.messageIndex}</Text>
      </Box>
      <Text dimColor>    {hit.snippet}</Text>
    </Box>
  );
}
