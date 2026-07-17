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
import { probeMessaging, type ProbeResult } from "./setup/assistant.js";

// `vanta setup messaging` — the messaging-gateway wizard. Mirrors runSetup:
// lists platforms with availability, configures an implemented one (writes env
// via the shared upsertEnv so other keys survive), previews planned ones. Pure
// render/build helpers below are unit-tested; runMessagingSetup is the I/O shell.

/** Env keys a chosen platform implies (enable flags + optional secret). Pure. */
export function buildMessagingEnv(
  platform: MessagingPlatform,
  secret?: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const updates: Record<string, string> = { ...(platform.enableEnv ?? {}) };
  if (platform.secretEnv && secret) updates[platform.secretEnv] = secret;
  return { ...updates, ...extra };
}

export function validateTelegramToken(token: string): boolean {
  return /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token.trim());
}

export function validateTelegramAllowlist(value: string): boolean {
  if (!value.trim()) return true;
  return value.split(",").every((id) => /^-?\d+$/.test(id.trim()));
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
type MessagingSetupOptions = {
  platformId?: string;
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  askSecret?: (rl: Readline, query: string) => Promise<string>;
  probe?: (env: NodeJS.ProcessEnv) => Promise<ProbeResult>;
};

export async function runMessagingSetup(
  repoRoot: string,
  rl?: Readline,
  opts: MessagingSetupOptions = {},
): Promise<boolean> {
  const ownRl = rl ?? createInterface({ input: process.stdin, output: process.stdout });
  const env = opts.env ?? process.env;
  const log = opts.log ?? console.log;
  try {
    log("\n  Vanta messaging setup\n");
    let platform = opts.platformId ? messagingPlatformById(opts.platformId) : undefined;
    if (opts.platformId && !platform) {
      log(`  Unknown messaging platform: ${opts.platformId}. Nothing written.`);
      return false;
    }
    if (!platform) {
      log(renderMessagingMenu(env));
      const pick = (await ownRl.question(`\n  Platform [1-${MESSAGING_CATALOG.length}]: `)).trim();
      platform = MESSAGING_CATALOG[Number.parseInt(pick, 10) - 1];
    }
    if (!platform) {
      log("  No valid platform chosen. Nothing written.");
      return false;
    }

    const configured = platformAvailability(platform, env).configured;
    if (configured) {
      log(`  ${platform.label} is already configured.`);
      const replace = (await ownRl.question("  Reconfigure it? [y/N]: ")).trim().toLowerCase();
      if (replace !== "y" && replace !== "yes") {
        log("  Kept the existing configuration.");
        return false;
      }
    }

    log(renderSetupSteps(platform));

    if (!platform.implemented) {
      log(
        `\n  ${platform.label}'s adapter isn't built yet — steps shown for reference. Nothing written.\n`,
      );
      return false;
    }

    let secret: string | undefined;
    if (platform.secretEnv) {
      secret = await (opts.askSecret ?? promptSecret)(ownRl, `\n  Paste your ${platform.secretEnv} (hidden): `);
      if (!secret) {
        log("  No value entered. Nothing written.");
        return false;
      }
    }

    let extra: Record<string, string> = {};
    if (platform.id === "telegram") {
      if (!validateTelegramToken(secret ?? "")) {
        log("  Telegram token format is invalid. Copy the complete HTTP API token from @BotFather. Nothing written.");
        return false;
      }
      const candidate = { ...env, VANTA_TELEGRAM_TOKEN: secret };
      const check = await (opts.probe ?? probeMessaging)(candidate);
      if (!check.ok) {
        log(`  Telegram verification failed: ${check.detail}. Nothing written.`);
        return false;
      }
      log(`  Verified ${check.detail}.`);
      const currentAllow = env.VANTA_TELEGRAM_ALLOW?.trim() ?? "";
      const allow = (await ownRl.question(
        currentAllow
          ? `  Owner Telegram user/chat IDs [${currentAllow}]: `
          : "  Owner Telegram user/chat IDs (comma-separated; empty allows anyone): ",
      )).trim() || currentAllow;
      if (!validateTelegramAllowlist(allow)) {
        log("  Telegram owner IDs must be comma-separated numbers. Nothing written.");
        return false;
      }
      if (allow) extra.VANTA_TELEGRAM_ALLOW = allow;
      else log("  Warning: no owner allowlist set; anyone who can reach the bot may ask Vanta to act.");
    }

    const path = envPath(repoRoot);
    const existing = existsSync(path) ? await readFile(path, "utf8") : "";
    await writeFile(path, upsertEnv(existing, buildMessagingEnv(platform, secret, extra)), { mode: 0o600 });

    log(`\n  Configured ${platform.label}. Run \`vanta gateway\` to go live, then send the bot a message.\n`);
    return true;
  } finally {
    if (!rl) ownRl.close();
  }
}

export { messagingPlatformById };
