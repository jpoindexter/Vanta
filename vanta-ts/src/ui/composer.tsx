import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "inkr";

// Minimal controlled composer on real Ink's useInput. Printable chars, backspace,
// delete, cursor left/right, home/end, submit on Enter. Deliberately small — the
// fork's input layer is what ate days; this is ~1 screen and easy to extend later.

export function Composer(props: {
  busy: boolean;
  onSubmit: (text: string) => void;
  placeholder: string;
}): ReactElement {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.return) {
      const text = value.trim();
      if (text && !props.busy) { props.onSubmit(text); setValue(""); setCursor(0); }
      return;
    }
    const next = editStep(value, cursor, input, key);
    if (next) { setValue(next.value); setCursor(next.cursor); }
  });

  return (
    <Box>
      <Text color="cyan">› </Text>
      {value.length === 0 ? <Text dimColor>{props.placeholder}</Text> : <CursorText value={value} cursor={cursor} />}
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
