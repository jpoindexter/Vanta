import "../desktop-native/runtime-fetch-init.mjs";
import { markLaunch } from "./cli/launch-trace.js";
import { findRepoRoot, loadEnv } from "./cli/startup-env.js";
import { initializeStoreAndProfile } from "./cli/startup-store.js";
import { parseStartupFlags } from "./cli/startup-flags.js";

// Static imports stay minimal: `vanta desktop` must reach its listener without
// loading the REPL, TUI or command table, so every heavy entry is a dynamic import.
async function main(): Promise<void> {
  markLaunch("cli imports done");
  const repoRoot = findRepoRoot();
  loadEnv(repoRoot);
  await initializeStoreAndProfile();
  markLaunch("store+profile ready");

  const parsed = parseStartupFlags(process.argv.slice(2));
  const [cmd, ...rest] = parsed.rest;
  if (cmd === "desktop" && !parsed.dumpPrompt) {
    const { runDesktopEntry } = await import("./cli/desktop-entry.js");
    return runDesktopEntry(repoRoot, rest);
  }
  const { runCli } = await import("./cli/main-dispatch.js");
  return runCli(repoRoot, parsed);
}

main().catch((err: unknown) => {
  console.error(`\nvanta error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
