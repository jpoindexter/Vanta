import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

// TUI-CMD-BACKSPACE-TERMINALAPP — Cmd+Backspace → clear-line (TUI-CMD-BACKSPACE-
// CLEAR) only works on kitty-protocol terminals; macOS Terminal.app can't deliver
// the Cmd modifier at all. On Terminal.app, surface a ONE-TIME hint pointing to
// ^U (the universal fallback) or a kitty-capable terminal. Zero change elsewhere.

const HINT_ID = "cmd-backspace-terminalapp";

/** True on macOS Terminal.app (the only terminal that both reserves Cmd AND
 * lacks the kitty/CSI-u protocol, so Cmd+Backspace can't reach the app). Pure. */
export function isTerminalApp(env: NodeJS.ProcessEnv): boolean {
  return env.TERM_PROGRAM === "Apple_Terminal";
}

/** True when the terminal speaks the kitty keyboard protocol (carries Cmd/super).
 * These deliver Cmd+Backspace, so no hint is needed. Pure. */
export function isKittyCapable(env: NodeJS.ProcessEnv): boolean {
  const program = (env.TERM_PROGRAM ?? "").toLowerCase();
  return (
    Boolean(env.KITTY_WINDOW_ID) || (env.TERM ?? "").includes("kitty") ||
    program.includes("ghostty") || program.includes("wezterm") || Boolean(env.WEZTERM_PANE) ||
    program.includes("iterm") // recent iTerm2 supports CSI-u
  );
}

/** The one-time hint text. Pure. */
export function cmdBackspaceHint(): string {
  return [
    "  ⓘ Terminal.app note: Cmd+Backspace can't reach Vanta here (it needs a kitty-protocol",
    "    terminal like Ghostty, Kitty, WezTerm, or recent iTerm2). Use ^U to clear the line,",
    "    or switch terminals for the Cmd+Backspace shortcut. (Shown once.)",
  ].join("\n");
}

/**
 * Decide whether to show the hint: only on Terminal.app, only when NOT already
 * kitty-capable, and only if it hasn't been shown before. Pure over its inputs. */
export function shouldShowCmdBackspaceHint(env: NodeJS.ProcessEnv, alreadyShown: boolean): boolean {
  return !alreadyShown && isTerminalApp(env) && !isKittyCapable(env);
}

function hintsPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "shown-hints.json");
}

/** Read the set of hint ids already shown (tolerant: missing/corrupt → empty). */
async function readShownHints(env: NodeJS.ProcessEnv): Promise<string[]> {
  return readFile(hintsPath(env), "utf8")
    .then((t) => { const a: unknown = JSON.parse(t); return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : []; })
    .catch(() => []);
}

/**
 * Show the Cmd+Backspace hint once on Terminal.app, then persist that it's been
 * shown. Best-effort (a store failure never blocks startup). `emit` is the
 * output sink (console.log in the host). Returns whether it showed. */
export async function maybeShowCmdBackspaceHint(env: NodeJS.ProcessEnv, emit: (msg: string) => void): Promise<boolean> {
  const shown = await readShownHints(env);
  if (!shouldShowCmdBackspaceHint(env, shown.includes(HINT_ID))) return false;
  emit(cmdBackspaceHint());
  try {
    await mkdir(resolveVantaHome(env), { recursive: true });
    await writeFile(hintsPath(env), JSON.stringify([...shown, HINT_ID]), "utf8");
  } catch { /* best-effort — a failed persist just re-shows next time */ }
  return true;
}
