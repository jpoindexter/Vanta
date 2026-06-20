import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { FOCUS } from "../../term/palette.js";
import { fuzzyRank } from "./fuzzy-picker-match.js";

// A generic fuzzy picker: type to filter, ↑/↓ to move the selection, Enter to
// activate, Esc to close. Generic over the item type via a `toLabel` accessor;
// the pure match/rank logic lives in fuzzy-picker-match.ts. Lives in the live
// region (not <Static>), so it disappears on close.

const RESULT_LIMIT = 12;

export function FuzzyPicker<T>(props: {
  items: readonly T[];
  toLabel: (item: T) => string;
  onSelect: (item: T) => void;
  onClose?: () => void;
  title?: string;
  isActive?: boolean;
}): ReactElement {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const results = fuzzyRank(props.items, query, props.toLabel, RESULT_LIMIT);
  const clamped = Math.min(sel, Math.max(0, results.length - 1));

  const retype = (next: string): void => { setQuery(next); setSel(0); };
  useInput(
    (input, key) => {
      if (key.escape) return void props.onClose?.();
      if (key.return) return void activate(results[clamped]?.item, props.onSelect);
      if (key.upArrow) return void setSel((s) => Math.max(0, s - 1));
      if (key.downArrow) return void setSel((s) => Math.min(results.length - 1, s + 1));
      if (key.backspace || key.delete) return void retype(query.slice(0, -1));
      if (input && !key.ctrl && !key.meta) retype(query + input);
    },
    { isActive: props.isActive ?? true },
  );

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold>{props.title ?? "Search"} </Text>
        {query ? <Text color={FOCUS}>{query}</Text> : <Text dimColor>type to filter</Text>}
      </Box>
      {results.length === 0
        ? <Text dimColor>  no matches</Text>
        : results.map((r, i) => (
            <PickerRow key={props.toLabel(r.item)} label={props.toLabel(r.item)} active={i === clamped} />
          ))}
      <Text dimColor>  ↑/↓ select · ⏎ open · Esc close</Text>
    </Box>
  );
}

/** Run the selected item's handler, if any. */
function activate<T>(item: T | undefined, onSelect: (item: T) => void): void {
  if (item !== undefined) onSelect(item);
}

function PickerRow(props: { label: string; active: boolean }): ReactElement {
  return (
    <Box>
      <Text color={props.active ? FOCUS : undefined}>{props.active ? "❯ " : "  "}</Text>
      <Text inverse={props.active}>{props.label}</Text>
    </Box>
  );
}
