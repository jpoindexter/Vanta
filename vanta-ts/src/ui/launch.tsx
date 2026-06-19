import { render } from "ink";
import { App } from "./app.js";
import { AppV2 } from "./v2/app-v2.js";
import { prepareRun, maybeCurate } from "../session.js";
import { RESTART_EXIT_CODE } from "../repl/restart-cmd.js";
import { installResizeGhostFix } from "../term/resize-fix.js";
import { promptTrust } from "./trust-prompt.js";

export type TuiSurface = "v1" | "v2";

export function selectTuiSurface(env: { VANTA_TUI?: string }): TuiSurface {
  return env.VANTA_TUI?.trim().toLowerCase() === "v2" ? "v2" : "v1";
}

/**
 * Launch the Claude-method UI (real Ink, inline + <Static>). v1 remains the
 * default; VANTA_TUI=v2 opts into the separate mission-control surface.
 */
export async function runTuiV2(repoRoot: string): Promise<void> {
  const confirmTrust = process.stdin.isTTY ? promptTrust : undefined;
  const setup = await prepareRun(repoRoot, "interactive session", undefined, { confirmTrust });
  await maybeCurate();
  const surface = selectTuiSurface(process.env);
  // Enable the kitty keyboard protocol so the Cmd (super) modifier reaches the
  // composer — it's the only way Cmd+Backspace etc. are delivered. mode "auto"
  // probes the terminal and is a no-op where unsupported (e.g. Terminal.app).
  const instance = render(
    surface === "v2" ? <AppV2 setup={setup} repoRoot={repoRoot} /> : <App setup={setup} repoRoot={repoRoot} />,
    { kittyKeyboard: { mode: "auto" } },
  );
  await installResizeGhostFix(process.stdout); // force absolute clear on resize (kills rewrap ghosting)
  await instance.waitUntilExit();
  if (process.exitCode === RESTART_EXIT_CODE) process.exit(RESTART_EXIT_CODE);
}
