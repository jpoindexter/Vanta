import { runSetup, envPath, askLine, setEnv } from "./setup.js";
import { select } from "./term/select.js";
import { SETTINGS, runSettingSection } from "./setup-sections.js";
import { runToolsSection } from "./setup-tools.js";
import { runMessagingSetup } from "./setup-messaging.js";
import { writeRegion } from "./brain/store.js";
import { resolveVantaHome } from "./store/home.js";
import { gatherCapabilities, formatHealth } from "./repl/health-cmd.js";
import {
  probeProvider,
  runGoogleStep,
  probeMcp,
  probeMessaging,
  type ProbeResult,
} from "./setup/assistant.js";

// `vanta setup` — the complete guided wizard: boxed banner → ◆ Configuration
// Location → ◆ Inference provider → settings sections → ◆ Messaging → ◆ Personality
// → ◆ Capability availability (✓/✗ per capability + the exact fix) → boxed ✓ Setup
// complete + a summary with file locations and the management commands.
// Model is required; the rest skip on Enter.

/** Explicit yes? Pure — empty or anything else is no. */
export function isYes(answer: string): boolean {
  return /^y(es)?$/i.test(answer.trim());
}

/** Draw a box around plain-text lines (auto-sized; single-column glyphs only). Pure. */
export function box(lines: string[]): string {
  const inner = Math.max(...lines.map((l) => [...l].length)) + 2;
  const bar = (l: string, r: string) => `  ${l}${"─".repeat(inner)}${r}`;
  const body = lines.map((l) => `  │ ${l}${" ".repeat(inner - 1 - [...l].length)}│`);
  return [bar("┌", "┐"), ...body, bar("└", "┘")].join("\n");
}

export function wizardBanner(): string {
  return "\n" + box(["◆ Vanta Setup Wizard", "Configure your operator end to end · Ctrl+C to exit"]);
}

/** A section header (`◆ Title`). Pure. */
export function sectionHeader(title: string): string {
  return `\n  ◆ ${title}\n`;
}

/** Where Vanta's settings + data live (shown up front). Pure. */
export function configLocation(repoRoot: string, env: NodeJS.ProcessEnv): string {
  return [
    `  ◆ Configuration Location`,
    `  Settings + secrets:  ${envPath(repoRoot)}`,
    `  Data + brain:        ${resolveVantaHome(env)}/`,
    "",
    "  Edit directly or use `vanta config edit`.",
  ].join("\n");
}

/** The closing summary — where files live + how to change things later. Pure. */
export function summaryText(repoRoot: string, env: NodeJS.ProcessEnv): string {
  return [
    "  ◆ Your files:",
    `     Settings + secrets:  ${envPath(repoRoot)}`,
    `     Data + brain:        ${resolveVantaHome(env)}/`,
    "",
    "  ◆ Manage later:",
    "     vanta setup model       change model / provider",
    "     vanta setup messaging   configure a messaging gateway",
    "     vanta config get|set    view / change a setting (secrets → .env)",
    "     vanta config check      validate your config",
    "",
    "  · Run `vanta` to start.",
  ].join("\n");
}

function printProbe(label: string, result: ProbeResult, fix: string): void {
  console.log(`  ${result.ok ? "✓" : "✗"} ${label}: ${result.detail}`);
  if (!result.ok) console.log(`      → ${fix}`);
}

function loadFreshEnv(repoRoot: string): void {
  try { process.loadEnvFile(envPath(repoRoot)); } catch { /* fresh env unavailable */ }
}

export async function runFullSetup(repoRoot: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  console.log(wizardBanner());
  console.log("\n" + configLocation(repoRoot, env));

  console.log(sectionHeader("Inference provider"));
  if (env.VANTA_PROVIDER) console.log(`  Current: ${env.VANTA_PROVIDER} · ${env.VANTA_MODEL ?? "?"}\n`);
  if (!(await runSetup(repoRoot, { quiet: true, validate: (u) => probeProvider({ ...env, ...u }) }))) {
    console.log("\n  Setup needs a model backend. Re-run `vanta setup` when ready.\n");
    return false;
  }
  loadFreshEnv(repoRoot);

  console.log(sectionHeader("Google OAuth"));
  printProbe("Google", await runGoogleStep({ env }), "set VANTA_GOOGLE_CLIENT_ID/SECRET, then authorize");

  console.log(sectionHeader("MCP servers"));
  printProbe("MCP", await probeMcp({ env, cwd: repoRoot }), "add .mcp.json or VANTA_MCP_SERVERS");

  console.log(sectionHeader("Messaging gateway"));
  if ((await select("Connect a messaging gateway?", ["Connect Telegram / …", "Skip for now"])) === 0) {
    await runMessagingSetup(repoRoot);
    loadFreshEnv(repoRoot);
  }
  else console.log("  Skipped — `vanta setup messaging` anytime.");
  printProbe("Messaging", await probeMessaging(env), "run `vanta setup messaging`");

  for (const s of SETTINGS) await runSettingSection(repoRoot, s); // vision · search · max-iter · theme (Esc skips each)
  await runToolsSection(repoRoot); // enable/disable toolsets + per-tool provider menus
  loadFreshEnv(repoRoot);

  console.log(sectionHeader("Personality"));
  const persona = await askLine("  One line on how Vanta should act (Enter to skip): ");
  if (persona) {
    await writeRegion("identity", `The operator describes how I should act: ${persona}`, { append: true, env });
    console.log("  ✓ Added to Vanta's identity.");
  } else console.log("  Skipped — Vanta forms its personality as you work.");

  await runCapabilitiesSection(repoRoot);
  loadFreshEnv(repoRoot);

  console.log(sectionHeader("Capability availability"));
  console.log(formatHealth(await gatherCapabilities(env)));
  console.log("\n" + box(["✓ Setup complete!"]) + "\n");
  console.log(summaryText(repoRoot, env) + "\n");
  return true;
}

/**
 * `vanta setup` step — turn on AND machine-configure desktop control / voice /
 * auto-tune so the operator doesn't do it by hand: runs `brew install cliclick`,
 * opens the macOS permission panes, writes the env flags. The pane toggle itself
 * is the user's one click (the OS forbids any program flipping it for them).
 */
export async function runCapabilitiesSection(repoRoot: string): Promise<void> {
  console.log(sectionHeader("Desktop control · voice · auto-tune"));
  const desktop = (await select("Let Vanta SEE + CONTROL your screen? (installs cliclick + opens permission panes)", ["Yes — set it up", "Skip"])) === 0;
  const voice = (await select("Enable push-to-talk VOICE input? (opens the mic permission pane)", ["Yes", "Skip"])) === 0;
  const autoTune = (await select("AUTO-TRAIN a personal model as you use Vanta? (downloads a small model on first train)", ["Yes", "Skip"])) === 0;
  if (!desktop && !voice && !autoTune) {
    console.log("  Skipped — `vanta control` / `vanta voice mic` / `VANTA_LORA_AUTO=1` enable these anytime.");
    return;
  }
  const { desktopControlDoctor } = await import("./cli/control-cmd.js");
  const { planCapabilities, applyCapabilityPlan, realBrewInstall } = await import("./setup/capabilities.js");
  const { openPrivacyPane } = await import("./platform/macos-prefs.js");
  const plan = planCapabilities({
    platform: process.platform,
    cliclickPresent: desktopControlDoctor().cliclick,
    choice: { desktop, voice, autoTune },
  });
  await applyCapabilityPlan(plan, {
    installBrew: realBrewInstall,
    openPane: (p) => openPrivacyPane(p),
    writeEnv: (e) => setEnv(repoRoot, e),
  });
}
