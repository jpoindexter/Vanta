import { render } from "ink";
import { App } from "./app.js";
import { AppV2 } from "./v2/app-v2.js";
import { prepareRun, maybeCurate } from "../session.js";
import { RESTART_EXIT_CODE } from "../repl/restart-cmd.js";
import { installResizeGhostFix } from "../term/resize-fix.js";
import { enableBracketedPaste } from "../term/bracketed-paste.js";
import { promptTrust } from "./trust-prompt.js";
import { runSetupHandoff, type SetupHandoff } from "../setup/handoff.js";

export type TuiSurface = "v1" | "v2";

export function selectTuiSurface(env: { VANTA_TUI?: string }): TuiSurface {
  return env.VANTA_TUI?.trim().toLowerCase() === "v2" ? "v2" : "v1";
}

export async function runSetupResumeLoop<T>(deps: {
  prepare: (firstRun: boolean) => Promise<T>;
  runSurface: (setup: T, requestSetup: (request: SetupHandoff) => void) => Promise<void>;
  runSetup: (request: SetupHandoff) => Promise<boolean>;
}): Promise<void> {
  let firstRun = true;
  for (;;) {
    let setupHandoff: SetupHandoff | undefined;
    const setup = await deps.prepare(firstRun);
    firstRun = false;
    await deps.runSurface(setup, (request) => { setupHandoff = request; });
    if (!setupHandoff) return;
    await deps.runSetup(setupHandoff);
  }
}

/**
 * Launch the Claude-method UI (real Ink, inline + <Static>). v1 remains the
 * default; VANTA_TUI=v2 opts into the separate mission-control surface.
 */
export async function runTuiV2(repoRoot: string): Promise<void> {
  const confirmTrust = process.stdin.isTTY ? promptTrust : undefined;
  await maybeCurate();
  const surface = selectTuiSurface(process.env);
  await installResizeGhostFix(process.stdout); // force absolute clear on resize (kills rewrap ghosting)
  // Enable the kitty keyboard protocol so the Cmd (super) modifier reaches the
  // composer — it's the only way Cmd+Backspace etc. are delivered. mode "auto"
  // probes the terminal and is a no-op where unsupported (e.g. Terminal.app).
  await runSetupResumeLoop({
    prepare: (firstRun) => prepareRun(repoRoot, "interactive session", undefined, {
      confirmTrust: firstRun ? confirmTrust : undefined,
    }),
    runSurface: async (setup, onSetupRequest) => {
      const instance = render(
        surface === "v2"
          ? <AppV2 setup={setup} repoRoot={repoRoot} onSetupRequest={onSetupRequest} />
          : <App setup={setup} repoRoot={repoRoot} onSetupRequest={onSetupRequest} />,
        { kittyKeyboard: { mode: "auto" } },
      );
      // Own bracketed paste: Ink's usePaste-driven toggle proved unreliable (Terminal.app
      // delivered multi-line pastes as raw keystrokes → a newline submitted mid-paste).
      const disableBracketedPaste = enableBracketedPaste(process.stdout);
      process.once("exit", disableBracketedPaste);
      await instance.waitUntilExit();
      process.removeListener("exit", disableBracketedPaste);
      disableBracketedPaste();
      if (process.exitCode === RESTART_EXIT_CODE) process.exit(RESTART_EXIT_CODE);
    },
    runSetup: (request) => runSetupHandoff(repoRoot, request),
  });
}
