import { render } from "ink";
import { App } from "./app.js";
import { prepareRun, maybeCurate } from "../session.js";
import { RESTART_EXIT_CODE } from "../repl/restart-cmd.js";

// No-flicker env: opt into Ink's built-in alternateScreen mode.
// Ink v7 manages the buffer switch, cursor hide/restore, and unmount cleanup
// natively — this is the correct API rather than manual escape sequences.
// Accepts VANTA_NO_FLICKER=1 or its compat alias.
export function inAltScreen(): boolean {
  return process.env.VANTA_NO_FLICKER === "1" || process.env.CLAUDE_CODE_NO_FLICKER === "1";
}

/**
 * Launch the Ink TUI. Prepares the run (kernel up, provider, goals, system
 * prompt), runs session-start curation, then renders the React/Ink app and
 * waits for the user to exit. In alt-screen mode, Ink's own alternateScreen
 * option handles buffer switching and cleanup.
 */
export async function runTui(repoRoot: string): Promise<void> {
  const altScreen = inAltScreen();
  const setup = await prepareRun(repoRoot, "interactive session");
  await maybeCurate();
  const { waitUntilExit } = render(<App setup={setup} repoRoot={repoRoot} altScreen={altScreen} />, {
    ...(altScreen ? { alternateScreen: true } : {}),
  });
  await waitUntilExit();
  // /restart: force the sentinel exit so run.sh's loop re-execs with fresh code,
  // even if a stray handle would otherwise keep the process alive.
  if (process.exitCode === RESTART_EXIT_CODE) process.exit(RESTART_EXIT_CODE);
}
