import type { PlatformAdapter } from "./base.js";
import { TelegramAdapter, parseAllowlist } from "./telegram.js";
import { NtfyAdapter, parseTopicAllowlist } from "./ntfy.js";
import { MattermostAdapter, parseChannelAllowlist } from "./mattermost.js";
import { IrcAdapter, parseNickAllowlist } from "./irc.js";

// Pick the live messaging adapter for `vanta gateway` from env. Telegram first
// (a configured bot token wins), then Mattermost (URL + token + channel all
// set), then IRC (server + nick + channel), then ntfy. Returns undefined when
// nothing is configured — the gateway then runs cron/webhook only. One branch
// per wired platform; mirrors how `providers/index.ts` resolves an LLM by env.
export function resolvePlatform(env: NodeJS.ProcessEnv): PlatformAdapter | undefined {
  const token = env.VANTA_TELEGRAM_TOKEN?.trim();
  if (token) return new TelegramAdapter({
    token,
    allow: parseAllowlist(env.VANTA_TELEGRAM_ALLOW),
    apiBase: env.VANTA_TELEGRAM_API_BASE?.trim(),
    webhookSecret: env.VANTA_TELEGRAM_WEBHOOK_SECRET,
  });

  const mmUrl = env.VANTA_MATTERMOST_URL?.trim();
  const mmToken = env.VANTA_MATTERMOST_TOKEN?.trim();
  const mmChannel = env.VANTA_MATTERMOST_CHANNEL?.trim();
  if (mmUrl && mmToken && mmChannel) {
    return new MattermostAdapter({
      serverUrl: mmUrl,
      token: mmToken,
      channel: mmChannel,
      allow: parseChannelAllowlist(env.VANTA_MATTERMOST_ALLOW),
    });
  }

  const ircServer = env.VANTA_IRC_SERVER?.trim();
  const ircNick = env.VANTA_IRC_NICK?.trim();
  const ircChannel = env.VANTA_IRC_CHANNEL?.trim();
  if (ircServer && ircNick && ircChannel) {
    return new IrcAdapter({
      server: ircServer,
      nick: ircNick,
      channel: ircChannel,
      allow: parseNickAllowlist(env.VANTA_IRC_ALLOW),
    });
  }

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
