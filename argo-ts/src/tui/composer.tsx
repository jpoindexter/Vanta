import { useEffect, useState, type ReactElement } from "react";
import { Text, useInput } from "ink";

// Single-line input composer with readline/emacs key bindings — the bits
// ink-text-input is missing. macOS Terminal does NOT emit Cmd+Backspace to the
// app, so "clear the line" is bound to Ctrl+U (kill-to-start), the binding every
// terminal actually sends. Word delete is Ctrl+W / Option+Backspace.
//
// Value is controlled by the parent (the slash palette reads it); the cursor is
// local. Up/down/Tab are deliberately ignored so the slash palette's own
// useInput owns selection while this composer is mounted alongside it.

export type ComposerProps = {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  isActive?: boolean;
  color?: string;
};

/** Delete the word (and any trailing whitespace) immediately before `pos`. */
function deleteWordBefore(value: string, pos: number): { value: string; pos: number } {
  let i = pos;
  while (i > 0 && /\s/.test(value[i - 1]!)) i--;
  while (i > 0 && !/\s/.test(value[i - 1]!)) i--;
  return { value: value.slice(0, i) + value.slice(pos), pos: i };
}

export function Composer(props: ComposerProps): ReactElement {
  const { value, onChange, onSubmit, placeholder = "", isActive = true, color } = props;
  const [cursor, setCursor] = useState(value.length);

  // Keep the cursor inside the value when the parent rewrites it (e.g. clears on
  // submit, or tab-completes a slash command).
  useEffect(() => {
    setCursor((c) => Math.min(c, value.length));
  }, [value.length]);

  useInput(
    (input, key) => {
      // Submit.
      if (key.return) return onSubmit(value);

      // Cursor movement (left/right + home/end). Up/down/Tab are left for the
      // slash palette.
      if (key.leftArrow) return setCursor((c) => Math.max(0, c - 1));
      if (key.rightArrow) return setCursor((c) => Math.min(value.length, c + 1));
      if (key.ctrl && input === "a") return setCursor(0);
      if (key.ctrl && input === "e") return setCursor(value.length);

      // Kill-to-start (Ctrl+U) — the reliable "clear the line".
      if (key.ctrl && input === "u") {
        onChange(value.slice(cursor));
        return setCursor(0);
      }
      // Kill-to-end (Ctrl+K).
      if (key.ctrl && input === "k") return onChange(value.slice(0, cursor));

      // Delete word before cursor: Ctrl+W or Option/Alt+Backspace.
      if ((key.ctrl && input === "w") || (key.meta && (key.backspace || key.delete))) {
        const r = deleteWordBefore(value, cursor);
        onChange(r.value);
        return setCursor(r.pos);
      }

      // Delete the char before the cursor.
      if (key.backspace || key.delete) {
        if (cursor === 0) return;
        onChange(value.slice(0, cursor - 1) + value.slice(cursor));
        return setCursor((c) => c - 1);
      }

      // Ignore remaining control/navigation keys (incl. up/down/tab).
      if (!input || key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow || key.escape) return;

      // Insert printable text at the cursor.
      onChange(value.slice(0, cursor) + input + value.slice(cursor));
      setCursor((c) => c + input.length);
    },
    { isActive },
  );

  if (value.length === 0) {
    return (
      <Text>
        <Text inverse> </Text>
        <Text dimColor>{placeholder}</Text>
      </Text>
    );
  }

  const c = Math.min(cursor, value.length);
  const before = value.slice(0, c);
  const at = value[c] ?? " ";
  const after = value.slice(c + 1);
  return (
    <Text color={color}>
      {before}
      <Text inverse>{at}</Text>
      {after}
    </Text>
  );
}
