import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "inkr";
import { SlashPalette } from "./slash-palette.js";
import { AtPalette } from "./at-palette.js";
import { matchSlash, completeSlash, isPartialSlash } from "./slash.js";
import { activeAtRef, matchAtFiles, completeAtRef } from "./at.js";

// Minimal controlled composer on real Ink's useInput. Printable chars, backspace,
// delete, cursor left/right submit on Enter. Two inline palettes: `/` drives the
// command palette (↑/↓ select, Tab/Enter complete), `@` drives the file-mention
// palette (↑/↓ select, Tab complete; Enter submits and the @ref content inlines
// at send). Deliberately small — the fork's input layer is what ate days.

export function Composer(props: {
  onSubmit: (text: string) => void;
  placeholder: string;
  files: string[];
}): ReactElement {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState(0);

  const slashMatches = matchSlash(value);
  const atPartial = slashMatches.length === 0 ? activeAtRef(value) : null;
  const atMatches = atPartial !== null ? matchAtFiles(props.files, atPartial) : [];
  const activeLen = slashMatches.length || atMatches.length;
  const selClamped = Math.min(sel, Math.max(0, activeLen - 1));

  const submitNow = (): void => {
    const text = (isPartialSlash(value, slashMatches) ? completeSlash(value, slashMatches, selClamped) : value).trim();
    setValue(""); setCursor(0); setSel(0);
    if (text) props.onSubmit(text);
  };
  const completeNow = (): void => {
    const done = slashMatches.length
      ? completeSlash(value, slashMatches, selClamped)
      : completeAtRef(value, atMatches, selClamped);
    setValue(done); setCursor(done.length); setSel(0);
  };

  useInput((input, key) => {
    if (key.return) return void submitNow();
    if (activeLen > 0 && handlePaletteKey({ key, len: activeLen, sel: selClamped, setSel, complete: completeNow })) return;
    const next = editStep(value, cursor, input, key);
    if (next) { setValue(next.value); setCursor(next.cursor); setSel(0); }
  });

  return (
    <Box flexDirection="column">
      <SlashPalette matches={slashMatches} sel={selClamped} />
      <AtPalette files={atMatches} sel={selClamped} />
      <Box>
        <Text color="cyan">› </Text>
        {value.length === 0 ? <Text dimColor>{props.placeholder}</Text> : <CursorText value={value} cursor={cursor} />}
      </Box>
    </Box>
  );
}

type Key = { upArrow?: boolean; downArrow?: boolean; tab?: boolean; leftArrow?: boolean; rightArrow?: boolean; backspace?: boolean; delete?: boolean; ctrl?: boolean; meta?: boolean };

type PaletteKeyOpts = { key: Key; len: number; sel: number; setSel: (n: number) => void; complete: () => void };

/** Palette navigation: ↑/↓ move the selection, Tab completes. True when handled. */
function handlePaletteKey(o: PaletteKeyOpts): boolean {
  if (o.key.upArrow) { o.setSel(Math.max(0, o.sel - 1)); return true; }
  if (o.key.downArrow) { o.setSel(Math.min(o.len - 1, o.sel + 1)); return true; }
  if (o.key.tab) { o.complete(); return true; }
  return false;
}

type Edit = { value: string; cursor: number };

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
