import { useEffect, useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { listSessions } from "../sessions/store.js";
import { listSkills } from "../skills/store.js";
import { SLASH_COMMANDS } from "../repl/catalog.js";
import {
  aggregateItems,
  fuzzyFilter,
  CATEGORY_ICON,
  type QuickItem,
} from "./quick-open-filter.js";
import { planColumns, clipTo, termWidth } from "../term/width.js";

// VANTA-QUICK-OPEN — the Ctrl+P unified picker. One fuzzy search over files,
// recent sessions, slash commands, and skills. Lives in the live region (not
// <Static>), so it disappears on close. Pure ranking/aggregation is in
// quick-open-filter.ts; this component only loads sources + drives input.

const RESULT_LIMIT = 12;
const PREFIX = 4; // "❯ " + category icon + space before the label

/** Async-load the two store-backed sources; files + commands come from props. */
function useQuickItems(files: string[]): QuickItem[] {
  const [extra, setExtra] = useState<{ sessions: QuickItem[]; skills: QuickItem[] }>({ sessions: [], skills: [] });
  useEffect(() => {
    void Promise.allSettled([listSessions(process.env), listSkills(process.env)]).then(([s, k]) => {
      setExtra({
        sessions: s.status === "fulfilled" ? aggregateItems({ sessions: s.value }) : [],
        skills: k.status === "fulfilled" ? aggregateItems({ skills: k.value }) : [],
      });
    });
  }, []);
  return [
    ...aggregateItems({ files, commands: SLASH_COMMANDS }),
    ...extra.sessions,
    ...extra.skills,
  ];
}

export function QuickOpen(props: {
  files: string[];
  onActivate: (command: string) => void;
  onClose: () => void;
}): ReactElement {
  const items = useQuickItems(props.files);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const results = fuzzyFilter(items, query, RESULT_LIMIT);
  const clamped = Math.min(sel, Math.max(0, results.length - 1));
  const cols = planColumns(results.map((r) => r.label), { width: termWidth() - PREFIX, nameCap: 30 });

  const onType = (next: string): void => { setQuery(next); setSel(0); };
  useInput((input, key) => {
    if (key.escape) return void props.onClose();
    if (key.return) return void activate(results[clamped], props.onActivate);
    if (key.upArrow) return void setSel((s) => Math.max(0, s - 1));
    if (key.downArrow) return void setSel((s) => Math.min(results.length - 1, s + 1));
    if (key.backspace || key.delete) return void onType(query.slice(0, -1));
    if (input && !key.ctrl && !key.meta) onType(query + input);
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Quick Open · {query ? query : <Text dimColor>type to filter files · sessions · commands · skills</Text>}</Text>
      {results.length === 0
        ? <Text dimColor>  no matches</Text>
        : results.map((r, i) => <QuickRow key={`${r.category}:${r.command}`} item={r} active={i === clamped} nameCol={cols.nameCol} descW={cols.descW} />)}
      <Text dimColor>  ↑/↓ select · ⏎ open · Esc close</Text>
    </Box>
  );
}

/** Run the selected item's command, if any. */
function activate(item: QuickItem | undefined, onActivate: (command: string) => void): void {
  if (item) onActivate(item.command);
}

function QuickRow(props: { item: QuickItem; active: boolean; nameCol: number; descW: number }): ReactElement {
  const { item, active, nameCol, descW } = props;
  return (
    <Box>
      <Text>{active ? "❯ " : "  "}</Text>
      <Text dimColor>{CATEGORY_ICON[item.category]} </Text>
      <Text inverse={active}>{item.label.padEnd(nameCol)}</Text>
      {item.hint ? <Text dimColor> {clipTo(item.hint, descW)}</Text> : null}
    </Box>
  );
}
