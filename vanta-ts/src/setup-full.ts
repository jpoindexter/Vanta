import { createInterface, type Interface as Readline } from "node:readline/promises";
import { runSetup, envPath } from "./setup.js";
import { runMessagingSetup } from "./setup-messaging.js";
import { readMcpConfig } from "./mcp/mount.js";
import { writeRegion } from "./brain/store.js";
import { gatherStatus, formatStatus } from "./status.js";

// `vanta setup` — the COMPLETE guided wizard (was a model picker only). Chains the
// existing single-purpose wizards into one onboarding pass + a closing health check.
// Step 1 (model) is required; every later step is optional (Enter to skip). The deep
// per-setting config layer is tracked separately as SETUP-CONFIG-SYSTEM.

/** Explicit yes? Pure — empty or anything else counts as no. */
export function isYes(answer: string): boolean {
  return /^y(es)?$/i.test(answer.trim());
}

/** MCP awareness line — count configured servers + where to add. Read-only. */
export async function mcpStep(env: NodeJS.ProcessEnv, cwd: string): Promise<string> {
  const { servers } = await readMcpConfig(env, cwd);
  const n = Object.keys(servers ?? {}).length;
  return n > 0
    ? `  MCP: ${n} server(s) configured (edit ./.mcp.json or ~/.vanta/mcp.json to change).`
    : "  MCP: none configured — add servers in ./.mcp.json or ~/.vanta/mcp.json.";
}

export async function runFullSetup(
  repoRoot: string,
  rl?: Readline,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const ownRl = rl ?? createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => ownRl.question(q).then((a) => a.trim());
  try {
    console.log("\n  Vanta — complete setup. Step 1 (model) is required; the rest are optional (Enter to skip).");

    // 1. Provider + model (required)
    if (!(await runSetup(repoRoot, ownRl))) {
      console.log("  Setup needs a model backend to continue. Re-run `vanta setup` when ready.\n");
      return false;
    }
    try { process.loadEnvFile(envPath(repoRoot)); } catch { /* fresh env unavailable — keep current */ }

    // 2. Messaging gateway (optional)
    if (isYes(await ask("\n  Set up a messaging gateway (Telegram, …)? [y/N]: "))) {
      await runMessagingSetup(repoRoot, ownRl);
    }

    // 3. MCP servers (awareness)
    console.log("\n" + (await mcpStep(env, repoRoot)));

    // 4. Personality (optional — appended, never clobbers the seeded identity)
    const persona = await ask("\n  One line on how Vanta should act for you (optional): ");
    if (persona) {
      await writeRegion("identity", `The operator describes how I should act: ${persona}`, { append: true, env });
      console.log("  ✓ Added to Vanta's identity.");
    }

    // 5. Health check
    console.log("\n  Health check:\n");
    console.log(formatStatus(await gatherStatus(env)));
    console.log("\n  ✓ Setup complete. Run `vanta` to start.\n");
    return true;
  } finally {
    if (!rl) ownRl.close();
  }
}
