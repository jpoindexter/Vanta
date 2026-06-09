import { render } from "ink";
import { App } from "./app.js";
import { prepareRun, maybeCurate } from "../session.js";
import { RESTART_EXIT_CODE } from "../repl/restart-cmd.js";

// CC-NO-FLICKER-ENV: alternate screen buffer toggle. Accepts VANTA_NO_FLICKER=1
// or the Claude Code compat alias CLAUDE_CODE_NO_FLICKER=1.
const ALT_ENTER = "\x1b[?1049h\x1b[H";
const ALT_LEAVE = "\x1b[?1049l";

function inAltScreen(): boolean {
  return process.env.VANTA_NO_FLICKER === "1" || process.env.CLAUDE_CODE_NO_FLICKER === "1";
}

/**
 * Launch the Ink TUI. Prepares the run (kernel up, provider, goals, system
 * prompt), runs session-start curation, then renders the React/Ink app and
 * waits for the user to exit.
 */
export async function runTui(repoRoot: string): Promise<void> {
  const altScreen = inAltScreen();
  if (altScreen) process.stdout.write(ALT_ENTER);
  const setup = await prepareRun(repoRoot, "interactive session");
  await maybeCurate();
  const { waitUntilExit } = render(<App setup={setup} repoRoot={repoRoot} />);
  await waitUntilExit();
  if (altScreen) process.stdout.write(ALT_LEAVE);
  // /restart: force the sentinel exit so run.sh's loop re-execs with fresh code,
  // even if a stray handle would otherwise keep the process alive.
  if (process.exitCode === RESTART_EXIT_CODE) process.exit(RESTART_EXIT_CODE);
}
