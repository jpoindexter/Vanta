import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface, type Interface as Readline } from "node:readline/promises";
import {
  MESSAGING_CATALOG,
  messagingPlatformById,
  platformAvailability,
  type MessagingPlatform,
} from "./gateway/platforms/registry.js";
import { envPath, promptSecret, upsertEnv } from "./setup.js";

// `argo setup messaging` — the messaging-gateway wizard. Mirrors runSetup:
// lists platforms with availability, configures an implemented one (writes env
// via the shared upsertEnv so other keys survive), previews planned ones. Pure
// render/build helpers below are unit-tested; runMessagingSetup is the I/O shell.

/** Env keys a chosen platform implies (enable flags + optional secret). Pure. */
export function buildMessagingEnv(
  platform: MessagingPlatform,
  secret?: string,
): Record<string, string> {
  const updates: Record<string, string> = { ...(platform.enableEnv ?? {}) };
  if (platform.secretEnv && secret) updates[platform.secretEnv] = secret;
  return updates;
}

function status(platform: MessagingPlatform, env: NodeJS.ProcessEnv): string {
  if (!platform.implemented) return "planned";
  return platformAvailability(platform, env).configured ? "configured" : "available";
}

/** The numbered platform menu with a status tag per row. Pure. */
export function renderMessagingMenu(env: NodeJS.ProcessEnv): string {
  return MESSAGING_CATALOG.map(
    (p, i) => `  ${i + 1}. ${p.label}  [${status(p, env)}]`,
  ).join("\n");
}

/** Prerequisite + warning + ordered steps for one platform. Pure. */
export function renderSetupSteps(platform: MessagingPlatform): string {
  const lines = [`\n  ${platform.label} setup:`];
  if (platform.prerequisite) lines.push(`  prerequisite: ${platform.prerequisite}`);
  if (platform.signupUrl) lines.push(`  link: ${platform.signupUrl}`);
  if (platform.warning) lines.push(`  ⚠ ${platform.warning}`);
  platform.setupSteps.forEach((s, i) => lines.push(`    ${i + 1}. ${s}`));
  return lines.join("\n");
}

/**
 * Run the messaging wizard. Returns true if env was written. `rl` is injectable
 * for tests; a real TTY is created when omitted.
 */
export async function runMessagingSetup(repoRoot: string, rl?: Readline): Promise<boolean> {
  const ownRl = rl ?? createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("\n  Vanta messaging setup — pick a gateway.\n");
    console.log(renderMessagingMenu(process.env));

    const pick = (await ownRl.question(`\n  Platform [1-${MESSAGING_CATALOG.length}]: `)).trim();
    const platform = MESSAGING_CATALOG[Number.parseInt(pick, 10) - 1];
    if (!platform) {
      console.log("  No valid platform chosen. Nothing written.");
      return false;
    }

    console.log(renderSetupSteps(platform));

    if (!platform.implemented) {
      console.log(
        `\n  ${platform.label}'s adapter isn't built yet — steps shown for reference. Nothing written.\n`,
      );
      return false;
    }

    let secret: string | undefined;
    if (platform.secretEnv) {
      secret = await promptSecret(ownRl, `\n  Paste your ${platform.secretEnv} (hidden): `);
      if (!secret) {
        console.log("  No value entered. Nothing written.");
        return false;
      }
    }

    const path = envPath(repoRoot);
    const existing = existsSync(path) ? await readFile(path, "utf8") : "";
    await writeFile(path, upsertEnv(existing, buildMessagingEnv(platform, secret)), { mode: 0o600 });

    console.log(`\n  ✓ Configured ${platform.label}. Run \`argo gateway\` to go live.\n`);
    return true;
  } finally {
    if (!rl) ownRl.close();
  }
}

export { messagingPlatformById };
