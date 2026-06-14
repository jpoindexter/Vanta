import { parseShortcut, runBashShortcut, runMemoryShortcut } from "../repl/shortcuts.js";
import type { SafetyClient } from "../safety-client.js";

// The `!cmd` (kernel-gated shell) and `#note` (save to brain) prefixes. Reuses
// the same parseShortcut/runBashShortcut/runMemoryShortcut the readline REPL +
// old TUI use; output commits as a note in the v2 transcript.

export type ShortcutDeps = {
  safety: SafetyClient;
  repoRoot: string;
  note: (text: string) => void;
};

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Run a `!cmd` / `#note` prefix line if present. Returns true when handled. */
export function maybeRunShortcut(line: string, deps: ShortcutDeps): boolean {
  const s = parseShortcut(line);
  if (!s) return false;
  const fail = (e: unknown): void => deps.note(`  error: ${msg(e)}`);
  if (s.type === "bash") void runBashShortcut(s.cmd, deps.safety, deps.repoRoot).then(deps.note).catch(fail);
  else void runMemoryShortcut(s.text, process.env).then(deps.note).catch(fail);
  return true;
}
