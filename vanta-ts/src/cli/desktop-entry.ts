import { markLaunch } from "./launch-trace.js";
import { runDesktopCommand } from "./ops-app.js";
import { applyDesktopKernelLifecycle } from "../kernel-guard/desktop-lifecycle.js";
import { startRunPrewarm } from "../session/prewarm.js";

/** `vanta desktop`: reaches the HTTP listener without loading the REPL, TUI or command table. */
export async function runDesktopEntry(repoRoot: string, rest: string[]): Promise<void> {
  markLaunch("desktop entry");
  await applyDesktopKernelLifecycle();
  startRunPrewarm(repoRoot);
  await runDesktopCommand(repoRoot, rest);
}
