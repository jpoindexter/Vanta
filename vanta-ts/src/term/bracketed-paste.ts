// Force-own bracketed paste mode. Ink toggles it from `usePaste` mounts, but that
// proved unreliable (Terminal.app delivered multi-line pastes as raw keystrokes,
// so a newline inside the paste fired Enter and submitted mid-paste). When the
// mode is ON, the terminal wraps every paste in ESC[200~ … ESC[201~, and Ink's
// input parser reassembles it across chunks into one atomic paste event — so the
// composer inserts it whole (no submit, no dropped chars) regardless of terminal.

const ENABLE = "[?2004h";
const DISABLE = "[?2004l";

export type PasteOut = { isTTY?: boolean; write: (s: string) => void };

/**
 * Enable bracketed paste on a TTY. No-op on a non-TTY (piped/headless). Returns a
 * disable fn to call on exit so the mode is restored for the user's shell.
 */
export function enableBracketedPaste(out: PasteOut): () => void {
  if (!out.isTTY) return () => {};
  out.write(ENABLE);
  let disabled = false;
  return () => {
    if (disabled) return;
    disabled = true;
    try { out.write(DISABLE); } catch { /* stream may be closing on exit */ }
  };
}
