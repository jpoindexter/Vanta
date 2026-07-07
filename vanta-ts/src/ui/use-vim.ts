import { useState } from "react";
import { vimNormalKey, INITIAL_VIM, type VimMode, type VimState } from "./vim-mode.js";
import type { Key } from "./composer-keys.js";

// Composer-side glue for the pure vim state machine (vim-mode.ts). Owns the mode
// state and turns a keypress into buffer edits via setBuf. Kept out of composer.tsx
// so the component body and its useInput callback stay under the size gate.

export type VimHandle = {
  /** Current mode for the indicator, or undefined when vi-mode is off. */
  mode?: VimMode;
  /** Reset to the default (insert) — call on submit so the next line types normally. */
  reset: () => void;
  /** Handle a keypress. Returns true when the key was consumed (normal mode always
   * consumes; insert mode consumes only Esc, otherwise falls through to readline). */
  handle: (args: { input: string; key: Key; value: string; cursor: number; setBuf: (v: string, c: number) => void }) => boolean;
};

/** vi-mode for the composer. `enabled` mirrors props.vim; when off, `mode` is
 * undefined and `handle` never consumes a key. */
export function useVim(enabled: boolean): VimHandle {
  const [st, setSt] = useState<VimState>(INITIAL_VIM);
  return {
    mode: enabled ? st.mode : undefined,
    reset: () => setSt(INITIAL_VIM),
    handle: ({ input, key, value, cursor, setBuf }) => {
      if (!enabled) return false;
      // Insert mode: only Esc returns to normal; everything else falls through to readline.
      if (st.mode === "insert") { if (key.escape) { setSt({ ...st, mode: "normal" }); return true; } return false; }
      // Normal + visual are owned by the engine (visual routes internally).
      const r = vimNormalKey({ st, value, cursor, input, key });
      setSt(r.state);
      if (r.value !== value || r.cursor !== cursor) setBuf(r.value, r.cursor);
      return true; // command modes (normal/visual) never fall through to readline (no typing)
    },
  };
}
