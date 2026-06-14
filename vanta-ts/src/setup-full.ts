import { createInterface, type Interface as Readline } from "node:readline/promises";
import { runSetup, envPath } from "./setup.js";
import { runMessagingSetup } from "./setup-messaging.js";
import { readMcpConfig } from "./mcp/mount.js";
import { writeRegion } from "./brain/store.js";
import { gatherStatus, formatStatus } from "./status.js";
import { resolveVantaHome } from "./store/home.js";

// `vanta setup` — the complete guided wizard, modeled on the Hermes Agent wizard:
// banner → Quick/Full choice → `◆`-headed sections (model · capabilities · messaging
// · personality · health) → a summary with file locations + management commands.
// Step 1 (model) is required; Full adds the optional sections.

/** Explicit yes? Pure — empty or anything else is no. */
export function isYes(answer: string): boolean {
  return /^y(es)?$/i.test(answer.trim());
}

/** The wizard banner. Pure. */
export function wizardBanner(): string {
  return [
    "",
    "  ◆ Vanta Setup Wizard",
    "  Configure your operator end to end · Ctrl+C to exit",
    "  ─────────────────────────────────────────────────",
  ].join("\n");
}

/** A section header (Hermes `print_header` analogue). Pure. */
export function sectionHeader(title: string): string {
  return `\n  ◆ ${title}\n`;
}

/** The closing summary — what's configured, where files live, how to change it. Pure. */
export function summaryText(repoRoot: string, env: NodeJS.ProcessEnv): string {
  return [
    "  ◆ Setup complete",
    "",
    `  ✓ Provider: ${env.VANTA_PROVIDER ?? "—"}  ·  Model: ${env.VANTA_MODEL ?? "—"}`,
    "",
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

/** Capabilities awareness — tools + MCP. Read-only. */
export async function capabilitiesStep(env: NodeJS.ProcessEnv, cwd: string): Promise<string> {
  const { servers } = await readMcpConfig(env, cwd);
  const n = Object.keys(servers ?? {}).length;
  const mcp = n > 0
    ? `  MCP: ${n} server(s) connected (edit ./.mcp.json or ~/.vanta/mcp.json).`
    : "  MCP: none — add servers in ./.mcp.json or ~/.vanta/mcp.json.";
  return `  Tools: all built-in tools enabled (/tools to list · /auto for minimalism mode).\n${mcp}`;
}

/** Numbered menu → chosen index (defaults to 0 on an invalid pick). */
async function askChoice(rl: Readline, question: string, choices: string[]): Promise<number> {
  console.log(`\n  ${question}`);
  choices.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
  const idx = Number.parseInt((await rl.question(`\n  Choice [1-${choices.length}]: `)).trim(), 10) - 1;
  return idx >= 0 && idx < choices.length ? idx : 0;
}

export async function runFullSetup(
  repoRoot: string,
  rl?: Readline,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const ownRl = rl ?? createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => ownRl.question(q).then((a) => a.trim());
  try {
    console.log(wizardBanner());
    const full = (await askChoice(ownRl, "How would you like to set up Vanta?", [
      "Quick — pick a model, sensible defaults for everything else (recommended)",
      "Full — also configure messaging, MCP and personality",
    ])) === 1;

    console.log(sectionHeader("Model & provider"));
    if (!(await runSetup(repoRoot, ownRl, { quiet: true }))) {
      console.log("\n  Setup needs a model backend. Re-run `vanta setup` when ready.\n");
      return false;
    }
    try { process.loadEnvFile(envPath(repoRoot)); } catch { /* fresh env unavailable */ }

    if (full) {
      console.log(sectionHeader("Capabilities (tools + MCP)"));
      console.log(await capabilitiesStep(env, repoRoot));

      console.log(sectionHeader("Messaging gateway"));
      if (isYes(await ask("  Connect a messaging gateway (Telegram, …)? [y/N]: "))) await runMessagingSetup(repoRoot, ownRl);
      else console.log("  Skipped — `vanta setup messaging` anytime.");

      console.log(sectionHeader("Personality"));
      const persona = await ask("  One line on how Vanta should act (Enter to skip): ");
      if (persona) {
        await writeRegion("identity", `The operator describes how I should act: ${persona}`, { append: true, env });
        console.log("  ✓ Added to Vanta's identity.");
      } else console.log("  Skipped — Vanta forms its personality as you work.");
    }

    console.log(sectionHeader("Health check"));
    console.log(formatStatus(await gatherStatus(env)));
    console.log("\n" + summaryText(repoRoot, env) + "\n");
    return true;
  } finally {
    if (!rl) ownRl.close();
  }
}
