import { markLaunch } from "./launch-trace.js";
import { chooseDesktopLaunch, openNextApp } from "./desktop-next-launch.js";
import { runDesktopCommand } from "./ops-app.js";
import { applyDesktopKernelLifecycle } from "../kernel-guard/desktop-lifecycle.js";
import { startRunPrewarm } from "../session/prewarm.js";

/**
 * `vanta desktop`: a bare call opens the installed app (DN-14 cutover); anything else reaches
 * the HTTP listener without loading the REPL, TUI or command table.
 */
export async function runDesktopEntry(repoRoot: string, rest: string[]): Promise<void> {
  markLaunch("desktop entry");
  const choice = chooseDesktopLaunch(rest, process.env);
  if (choice.target === "next-app") {
    if (await openNextApp(choice.appPath)) return;
    console.error(`Could not open ${choice.appPath}; starting the classic desktop instead (vanta desktop --classic).`);
  }
  await applyDesktopKernelLifecycle();
  startRunPrewarm(repoRoot);
  await runDesktopCommand(repoRoot, choice.target === "classic" ? choice.args : []);
}
