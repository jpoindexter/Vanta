import { runSetup, envPath, askLine } from "./setup.js";
import { select } from "./term/select.js";
import { SETTINGS, runSettingSection } from "./setup-sections.js";
import { runMessagingSetup } from "./setup-messaging.js";
import { writeRegion } from "./brain/store.js";
import { resolveVantaHome } from "./store/home.js";
import { gatherCapabilities, formatHealth } from "./repl/health-cmd.js";

// `vanta setup` — the complete guided wizard, modeled on the real Hermes Agent
// wizard (hermes_cli/setup.py): boxed banner → ◆ Configuration Location →
// ◆ Inference provider → ◆ Messaging → ◆ Personality → ◆ Capability availability
// (✓/✗ per capability + the exact fix) → boxed ✓ Setup complete + a summary with
// file locations and the management commands. Model is required; the rest skip on Enter.

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

/** A section header (Hermes `print_header` analogue). Pure. */
export function sectionHeader(title: string): string {
  return `\n  ◆ ${title}\n`;
}

/** Where Vanta's settings + data live (shown up front, like Hermes). Pure. */
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
    "  📁 Your files:",
    `     Settings + secrets:  ${envPath(repoRoot)}`,
    `     Data + brain:        ${resolveVantaHome(env)}/`,
    "",
    "  📝 Manage later:",
    "     vanta setup model       change model / provider",
    "     vanta setup messaging   configure a messaging gateway",
    "     vanta config get|set    view / change a setting (secrets → .env)",
    "     vanta config check      validate your config",
    "",
    "  🚀 Run `vanta` to start.",
  ].join("\n");
}

export async function runFullSetup(repoRoot: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  console.log(wizardBanner());
  console.log("\n" + configLocation(repoRoot, env));

  console.log(sectionHeader("Inference provider"));
  if (env.VANTA_PROVIDER) console.log(`  Current: ${env.VANTA_PROVIDER} · ${env.VANTA_MODEL ?? "?"}\n`);
  if (!(await runSetup(repoRoot, { quiet: true }))) {
    console.log("\n  Setup needs a model backend. Re-run `vanta setup` when ready.\n");
    return false;
  }

  for (const s of SETTINGS) await runSettingSection(repoRoot, s); // vision · search · max-iter · theme (Esc skips each)
  try { process.loadEnvFile(envPath(repoRoot)); } catch { /* fresh env unavailable */ }

  console.log(sectionHeader("Messaging gateway"));
  if ((await select("Connect a messaging gateway?", ["Connect Telegram / …", "Skip for now"])) === 0) await runMessagingSetup(repoRoot);
  else console.log("  Skipped — `vanta setup messaging` anytime.");

  console.log(sectionHeader("Personality"));
  const persona = await askLine("  One line on how Vanta should act (Enter to skip): ");
  if (persona) {
    await writeRegion("identity", `The operator describes how I should act: ${persona}`, { append: true, env });
    console.log("  ✓ Added to Vanta's identity.");
  } else console.log("  Skipped — Vanta forms its personality as you work.");

  console.log(sectionHeader("Capability availability"));
  console.log(formatHealth(await gatherCapabilities(env)));
  console.log("\n" + box(["✓ Setup complete!"]) + "\n");
  console.log(summaryText(repoRoot, env) + "\n");
  return true;
}
