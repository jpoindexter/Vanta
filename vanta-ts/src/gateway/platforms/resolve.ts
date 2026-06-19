import type { PlatformAdapter } from "./base.js";
import { TelegramAdapter, parseAllowlist } from "./telegram.js";
import { NtfyAdapter, parseTopicAllowlist } from "./ntfy.js";

// Pick the live messaging adapter for `vanta gateway` from env. Telegram first
// (a configured bot token wins), then ntfy. Returns undefined when nothing is
// configured — the gateway then runs cron/webhook only. One branch per wired
// platform; mirrors how `providers/index.ts` resolves an LLM by env.
export function resolvePlatform(env: NodeJS.ProcessEnv): PlatformAdapter | undefined {
  const token = env.VANTA_TELEGRAM_TOKEN?.trim();
  if (token) return new TelegramAdapter({ token, allow: parseAllowlist(env.VANTA_TELEGRAM_ALLOW) });

  const topic = env.VANTA_NTFY_TOPIC?.trim();
  if (topic) {
    return new NtfyAdapter({
      topic,
      server: env.VANTA_NTFY_SERVER?.trim() || undefined,
      allow: parseTopicAllowlist(env.VANTA_NTFY_ALLOW),
    });
  }
  return undefined;
}
