import { render } from "ink";
import { App } from "./app.js";
import { prepareRun, maybeCurate } from "../session.js";

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
}
