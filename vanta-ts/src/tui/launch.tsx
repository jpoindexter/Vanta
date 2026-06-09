import { render } from "ink";
import { App } from "./app.js";
import { prepareRun, maybeCurate } from "../session.js";
import { RESTART_EXIT_CODE } from "../repl/restart-cmd.js";

/**
 * Launch the Ink TUI. Prepares the run (kernel up, provider, goals, system
 * prompt), runs session-start curation, then renders the React/Ink app and
 * waits for the user to exit.
 */
export async function runTui(repoRoot: string): Promise<void> {
  const setup = await prepareRun(repoRoot, "interactive session");
  await maybeCurate();
  const { waitUntilExit } = render(<App setup={setup} repoRoot={repoRoot} />);
  await waitUntilExit();
  // /restart: force the sentinel exit so run.sh's loop re-execs with fresh code,
  // even if a stray handle would otherwise keep the process alive.
  if (process.exitCode === RESTART_EXIT_CODE) process.exit(RESTART_EXIT_CODE);
}
