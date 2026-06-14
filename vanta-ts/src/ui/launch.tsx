import { render } from "ink";
import { App } from "./app.js";
import { prepareRun, maybeCurate } from "../session.js";
import { RESTART_EXIT_CODE } from "../repl/restart-cmd.js";

/**
 * Launch the v2 Claude-method UI (real Ink, inline + <Static>). No alternate
 * screen — output commits to native scrollback, so terminal selection, scroll,
 * and copy work without any in-app machinery. Reuses prepareRun (kernel up,
 * provider, goals, system prompt) — only the render surface is new.
 */
export async function runTuiV2(repoRoot: string): Promise<void> {
  const setup = await prepareRun(repoRoot, "interactive session");
  await maybeCurate();
  const instance = render(<App setup={setup} repoRoot={repoRoot} />);
  await instance.waitUntilExit();
  if (process.exitCode === RESTART_EXIT_CODE) process.exit(RESTART_EXIT_CODE);
}
