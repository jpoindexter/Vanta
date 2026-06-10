import { render } from "ink";
import { App } from "./app.js";
import { prepareRun, maybeCurate } from "../session.js";
import { RESTART_EXIT_CODE } from "../repl/restart-cmd.js";

// CC-NO-FLICKER-ENV: alternate screen buffer toggle. Accepts VANTA_NO_FLICKER=1
// or the Claude Code compat alias CLAUDE_CODE_NO_FLICKER=1.
//
// WARNING: the alternate buffer has NO native scrollback. The Static-based
// transcript model relies on terminal scrollback for history. Enable this only
// alongside a virtual viewport (CC-VIRTUAL-LIST); without it, lines that scroll
// off screen are unrecoverable. Disabled by default for this reason.
const ALT_ENTER = "\x1b[?1049h\x1b[H";
const ALT_LEAVE = "\x1b[?1049l";

function inAltScreen(): boolean {
  return process.env.VANTA_NO_FLICKER === "1" || process.env.CLAUDE_CODE_NO_FLICKER === "1";
}

/** Register cleanup handlers so a SIGINT/SIGTERM/uncaught exit restores the terminal. */
function registerAltScreenCleanup(): void {
  const restore = (): void => { process.stdout.write(ALT_LEAVE); };
  process.on("exit", restore);
  process.on("SIGINT", () => { restore(); process.exit(130); });
  process.on("SIGTERM", () => { restore(); process.exit(143); });
  // Clear the entire alt-screen on resize so Ink redraws from a clean slate.
  // Without this, resize events leave ghost frames as Ink miscounts wrapped lines.
  process.stdout.on("resize", () => { process.stdout.write("\x1b[2J\x1b[H"); });
}

/**
 * Launch the Ink TUI. Prepares the run (kernel up, provider, goals, system
 * prompt), runs session-start curation, then renders the React/Ink app and
 * waits for the user to exit.
 */
export async function runTui(repoRoot: string): Promise<void> {
  const altScreen = inAltScreen();
  if (altScreen) {
    process.stdout.write(ALT_ENTER);
    registerAltScreenCleanup();
  }
  const setup = await prepareRun(repoRoot, "interactive session");
  await maybeCurate();
  // prepareRun takes several seconds and any console output moves the cursor.
  // Reset to top-left before handing off to Ink so the first frame starts clean.
  if (altScreen) process.stdout.write("\x1b[2J\x1b[H");
  const { waitUntilExit } = render(<App setup={setup} repoRoot={repoRoot} />);
  await waitUntilExit();
  if (altScreen) process.stdout.write(ALT_LEAVE);
  // /restart: force the sentinel exit so run.sh's loop re-execs with fresh code,
  // even if a stray handle would otherwise keep the process alive.
  if (process.exitCode === RESTART_EXIT_CODE) process.exit(RESTART_EXIT_CODE);
}
