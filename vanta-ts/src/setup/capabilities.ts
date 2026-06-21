// `vanta setup` capability step — turn on desktop control / voice / auto-tune
// AND do the machine setup so the operator doesn't have to: actually run
// `brew install cliclick`, open the macOS permission panes, and write the env
// flags. The macOS toggle itself is the user's one click (the OS won't let any
// program flip it) — but setup installs the helper and lands them on the pane.
// Pure planner + injected executor (brew/pane/env), so it's fully testable.

import { execFileSync } from "node:child_process";
import type { PrivacyPane } from "../platform/macos-prefs.js";

/** What the operator opted into. */
export type CapabilityChoice = { desktop: boolean; voice: boolean; autoTune: boolean };

/** The concrete machine actions to perform. */
export type CapabilityPlan = {
  installCliclick: boolean;
  openPanes: PrivacyPane[];
  env: Record<string, string>;
  notes: string[];
};

/** Decide installs / panes / env writes from the choices + platform. Pure. */
export function planCapabilities(opts: {
  platform: NodeJS.Platform;
  cliclickPresent: boolean;
  choice: CapabilityChoice;
}): CapabilityPlan {
  const mac = opts.platform === "darwin";
  const openPanes: PrivacyPane[] = [];
  const env: Record<string, string> = {};
  const notes: string[] = [];
  let installCliclick = false;
  if (opts.choice.desktop) {
    if (mac) {
      openPanes.push("screen-recording", "accessibility");
      installCliclick = !opts.cliclickPresent;
    } else notes.push("Desktop control is macOS-only right now — skipped.");
  }
  if (opts.choice.voice) {
    if (mac) openPanes.push("microphone");
    env.VANTA_VOICE_PTT = "1";
  }
  if (opts.choice.autoTune) env.VANTA_LORA_AUTO = "1";
  return { installCliclick, openPanes, env, notes };
}

/** Outcome of a brew install attempt. */
export type BrewResult = { ok: boolean; message: string };

/** Actually run `brew install <pkg>` (live output). Errors-as-values. */
export const realBrewInstall = (pkg: string): BrewResult => {
  try {
    execFileSync("brew", ["install", pkg], { stdio: "inherit", timeout: 180_000 });
    return { ok: true, message: `✓ installed ${pkg}` };
  } catch (e) {
    return { ok: false, message: `couldn't auto-install ${pkg} (${e instanceof Error ? e.message : String(e)}) — run: brew install ${pkg}` };
  }
};

/** Injected executors for {@link applyCapabilityPlan}. */
export type ApplyDeps = {
  installBrew?: (pkg: string) => BrewResult;
  openPane?: (p: PrivacyPane) => { ok: boolean; message: string };
  writeEnv?: (env: Record<string, string>) => Promise<void>;
  log?: (l: string) => void;
};

/** Execute a plan: install cliclick, open the panes, write the env flags. */
export async function applyCapabilityPlan(plan: CapabilityPlan, deps: ApplyDeps): Promise<void> {
  const log = deps.log ?? console.log;
  for (const n of plan.notes) log(`  • ${n}`);
  if (plan.installCliclick && deps.installBrew) {
    log("  Installing cliclick (mouse/keyboard helper)…");
    log(`  ${deps.installBrew("cliclick").message}`);
  }
  if (deps.openPane) for (const p of plan.openPanes) log(`  ${deps.openPane(p).message}`);
  if (Object.keys(plan.env).length > 0 && deps.writeEnv) {
    await deps.writeEnv(plan.env);
    log(`  ✓ wrote ${Object.keys(plan.env).join(", ")} to .env`);
  }
}
