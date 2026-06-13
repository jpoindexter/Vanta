import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "inkr";
import { SlashPalette } from "./slash-palette.js";
import { matchSlash, completeSlash, isPartialSlash } from "./slash.js";

// Minimal controlled composer on real Ink's useInput. Printable chars, backspace,
// delete, cursor left/right, home/end, submit on Enter. When the line starts with
// `/` it drives an inline command palette: ↑/↓ select, Tab completes, Enter
// expands a partial then submits. Deliberately small — the fork's input layer is
// what ate days; this is one screen and easy to extend.

export function Composer(props: {
  onSubmit: (text: string) => void;
  placeholder: string;
}): ReactElement {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState(0);
  const matches = matchSlash(value);
  const selClamped = Math.min(sel, Math.max(0, matches.length - 1));

  const submitNow = (): void => {
    const text = (isPartialSlash(value, matches) ? completeSlash(value, matches, selClamped) : value).trim();
    setValue(""); setCursor(0); setSel(0);
    if (text) props.onSubmit(text);
  };
  const completeNow = (): void => {
    const done = completeSlash(value, matches, selClamped);
    setValue(done); setCursor(done.length); setSel(0);
  };

  useInput((input, key) => {
    if (key.return) return void submitNow();
    if (matches.length > 0) {
      if (key.upArrow) return void setSel(Math.max(0, selClamped - 1));
      if (key.downArrow) return void setSel(Math.min(matches.length - 1, selClamped + 1));
      if (key.tab) return void completeNow();
    }
    const next = editStep(value, cursor, input, key);
    if (next) { setValue(next.value); setCursor(next.cursor); setSel(0); }
  });

  return (
    <Box flexDirection="column">
      <SlashPalette matches={matches} sel={selClamped} />
      <Box>
        <Text color="cyan">› </Text>
        {value.length === 0 ? <Text dimColor>{props.placeholder}</Text> : <CursorText value={value} cursor={cursor} />}
      </Box>
    </Box>
  );
}

type Edit = { value: string; cursor: number };
type Key = { leftArrow?: boolean; rightArrow?: boolean; backspace?: boolean; delete?: boolean; ctrl?: boolean; meta?: boolean };

/** Pure: apply one keypress to (value, cursor). Returns null for no-ops/control chords. */
function editStep(value: string, cursor: number, input: string, key: Key): Edit | null {
  if (key.leftArrow) return { value, cursor: Math.max(0, cursor - 1) };
  if (key.rightArrow) return { value, cursor: Math.min(value.length, cursor + 1) };
  if (key.backspace || key.delete) {
    if (cursor === 0) return null;
    return { value: value.slice(0, cursor - 1) + value.slice(cursor), cursor: cursor - 1 };
  }
  if (input && !key.ctrl && !key.meta) {
    return { value: value.slice(0, cursor) + input + value.slice(cursor), cursor: cursor + input.length };
  }
  return null;
}

/** Render the value with an inverse-video block at the cursor column. */
function CursorText(props: { value: string; cursor: number }): ReactElement {
  const { value, cursor } = props;
  const before = value.slice(0, cursor);
  const at = value[cursor] ?? " ";
  const after = value.slice(cursor + 1);
  return (
    <Text>
      {before}<Text inverse>{at}</Text>{after}
    </Text>
  );
}
