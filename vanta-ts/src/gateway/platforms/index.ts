import { TelegramAdapter, parseAllowlist } from "./telegram.js";
import { IMessageAdapter } from "./imessage.js";
import { SignalAdapter } from "./signal.js";
import type { PlatformAdapter } from "./base.js";

/**
 * Resolve the active messaging platform from environment — the messaging mirror
 * of resolveProvider. Consumers (the gateway) depend on the PlatformAdapter port
 * and call this; adding a platform = a new adapter + one case here, never an edit
 * to cli/ops.ts. (ports/adapters, DECISIONS 2026-06-17.)
 *
 * Explicit `VANTA_MESSAGING_PLATFORM` wins; otherwise the platform is inferred
 * from whichever credentials are configured. Returns undefined when none is set
 * (the gateway then runs cron/webhook only).
 */
export function resolvePlatformAdapter(env: NodeJS.ProcessEnv): PlatformAdapter | undefined {
  const explicit = (env.VANTA_MESSAGING_PLATFORM ?? "").toLowerCase();
  if (explicit) return buildPlatform(explicit, env);
  if (env.VANTA_TELEGRAM_TOKEN) return buildPlatform("telegram", env);
  if (env.VANTA_SIGNAL_URL && env.VANTA_SIGNAL_NUMBER) return buildPlatform("signal", env);
  if (env.VANTA_IMESSAGE_ENABLE === "1") return buildPlatform("imessage", env);
  return undefined;
}

function buildPlatform(id: string, env: NodeJS.ProcessEnv): PlatformAdapter | undefined {
  switch (id) {
    case "telegram": {
      const token = env.VANTA_TELEGRAM_TOKEN;
      return token ? new TelegramAdapter({ token, allow: parseAllowlist(env.VANTA_TELEGRAM_ALLOW) }) : undefined;
    }
    case "signal": {
      const number = env.VANTA_SIGNAL_NUMBER;
      return number ? new SignalAdapter({ baseUrl: env.VANTA_SIGNAL_URL, number }) : undefined;
    }
    case "imessage":
      return new IMessageAdapter({ dbPath: env.VANTA_IMESSAGE_DB });
    default:
      return undefined;
  }
}

export type { PlatformAdapter } from "./base.js";
