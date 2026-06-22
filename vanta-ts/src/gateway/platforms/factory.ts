import type { PlatformAdapter } from "./base.js";
import { TelegramAdapter, parseAllowlist } from "./telegram.js";
import { NtfyAdapter, parseTopicAllowlist } from "./ntfy.js";
import { MattermostAdapter, parseChannelAllowlist } from "./mattermost.js";
import { IrcAdapter, parseNickAllowlist } from "./irc.js";
import { IMessageAdapter } from "./imessage.js";
import { SignalAdapter } from "./signal.js";
import { WhatsappAdapter, httpTransport as whatsappTransport, parseWhatsappAllowlist } from "./whatsapp.js";
import { SlackAdapter, httpTransport as slackTransport, parseSlackAllowlist } from "./slack.js";
import { DiscordAdapter, httpTransport as discordTransport, parseDiscordAllowlist } from "./discord.js";
import { MatrixAdapter, httpTransport as matrixTransport, parseMatrixAllowlist, matrixEnabled } from "./matrix.js";
import { LineAdapter, httpTransport as lineTransport, parseLineAllowlist, lineEnabled } from "./line.js";
import { MultiChannelAdapter } from "./multi-channel.js";

// Messaging adapter factory — the platform analogue of `providers/index.ts`'s
// `resolveProvider`. Each implemented platform is ONE registration entry below
// ({ configured, build }); adding a platform = one entry + its adapter file,
// nothing central to edit. `resolveMessagingAdapter(env)` walks the table in
// priority order and returns the first configured adapter (or undefined — the
// gateway then runs cron/webhook only). `createAdapter(id, env)` builds one
// adapter by id, returning a clear miss for an unknown/unconfigured id.
//
// Mirrors the honesty flag in registry.ts: only platforms with a live adapter
// appear here. The `requiredEnv`/secret metadata for the setup wizard lives in
// MESSAGING_CATALOG; this factory is purely the id → instance construction.

const SIGNAL_NUMBER_ENV = "VANTA_SIGNAL_NUMBER";

/** One registration entry per implemented platform. */
type AdapterEntry = {
  /** True when every env var this adapter needs is present (non-blank). */
  configured: (env: NodeJS.ProcessEnv) => boolean;
  /** Build the concrete adapter from env. Only called when `configured`. */
  build: (env: NodeJS.ProcessEnv) => PlatformAdapter;
};

const has = (env: NodeJS.ProcessEnv, key: string): boolean => Boolean(env[key]?.trim());

// Priority order is the iteration order of this map (telegram first, then
// mattermost, irc, ntfy, imessage, signal) — preserved by insertion order.
const ADAPTERS: Record<string, AdapterEntry> = {
  telegram: {
    configured: (env) => has(env, "VANTA_TELEGRAM_TOKEN"),
    build: (env) =>
      new TelegramAdapter({
        token: env.VANTA_TELEGRAM_TOKEN!.trim(),
        allow: parseAllowlist(env.VANTA_TELEGRAM_ALLOW),
      }),
  },
  mattermost: {
    configured: (env) =>
      has(env, "VANTA_MATTERMOST_URL") &&
      has(env, "VANTA_MATTERMOST_TOKEN") &&
      has(env, "VANTA_MATTERMOST_CHANNEL"),
    build: (env) =>
      new MattermostAdapter({
        serverUrl: env.VANTA_MATTERMOST_URL!.trim(),
        token: env.VANTA_MATTERMOST_TOKEN!.trim(),
        channel: env.VANTA_MATTERMOST_CHANNEL!.trim(),
        allow: parseChannelAllowlist(env.VANTA_MATTERMOST_ALLOW),
      }),
  },
  irc: {
    configured: (env) =>
      has(env, "VANTA_IRC_SERVER") && has(env, "VANTA_IRC_NICK") && has(env, "VANTA_IRC_CHANNEL"),
    build: (env) =>
      new IrcAdapter({
        server: env.VANTA_IRC_SERVER!.trim(),
        nick: env.VANTA_IRC_NICK!.trim(),
        channel: env.VANTA_IRC_CHANNEL!.trim(),
        allow: parseNickAllowlist(env.VANTA_IRC_ALLOW),
      }),
  },
  ntfy: {
    configured: (env) => has(env, "VANTA_NTFY_TOPIC"),
    build: (env) =>
      new NtfyAdapter({
        topic: env.VANTA_NTFY_TOPIC!.trim(),
        server: env.VANTA_NTFY_SERVER?.trim() || undefined,
        allow: parseTopicAllowlist(env.VANTA_NTFY_ALLOW),
      }),
  },
  imessage: {
    // Native macOS adapter; enabled by an explicit opt-in flag (permissions are
    // granted outside Vanta — see MESSAGING_CATALOG). No path/token in env.
    configured: (env) => has(env, "VANTA_IMESSAGE_ENABLE"),
    build: () => new IMessageAdapter(),
  },
  signal: {
    // Needs the signal-cli daemon URL (catalog-required) AND the linked number
    // the adapter sends/receives as (VANTA_SIGNAL_NUMBER).
    configured: (env) => has(env, "VANTA_SIGNAL_URL") && has(env, SIGNAL_NUMBER_ENV),
    build: (env) =>
      new SignalAdapter({
        baseUrl: env.VANTA_SIGNAL_URL!.trim(),
        number: env[SIGNAL_NUMBER_ENV]!.trim(),
      }),
  },
  whatsapp: {
    // WhatsApp Cloud API: needs the access token + sender phone-number id. Inbound
    // arrives via the webhook (poll is webhook-fed); outbound POSTs to the Cloud API.
    configured: (env) => has(env, "VANTA_WHATSAPP_TOKEN") && has(env, "VANTA_WHATSAPP_PHONE_ID"),
    build: (env) =>
      new WhatsappAdapter({
        transport: whatsappTransport(env.VANTA_WHATSAPP_TOKEN!.trim(), env.VANTA_WHATSAPP_PHONE_ID!.trim()),
        allow: parseWhatsappAllowlist(env),
      }),
  },
  slack: {
    // Slack: bot token for chat.postMessage; inbound via the Events API webhook
    // (poll is webhook-fed).
    configured: (env) => has(env, "VANTA_SLACK_BOT_TOKEN"),
    build: (env) =>
      new SlackAdapter({
        transport: slackTransport(env.VANTA_SLACK_BOT_TOKEN!.trim()),
        allow: parseSlackAllowlist(env),
      }),
  },
  discord: {
    // Discord: bot token + the channel id the adapter polls/sends in.
    configured: (env) => has(env, "VANTA_DISCORD_TOKEN") && has(env, "VANTA_DISCORD_CHANNEL"),
    build: (env) =>
      new DiscordAdapter({
        transport: discordTransport(env.VANTA_DISCORD_TOKEN!.trim()),
        channelId: env.VANTA_DISCORD_CHANNEL!.trim(),
        allow: parseDiscordAllowlist(env.VANTA_DISCORD_ALLOWLIST),
      }),
  },
  matrix: {
    // Matrix: homeserver URL + access token; replies route back to the originating
    // room (msg.chatId). VANTA_MATRIX_USER_ID (optional) skips the bot's own echoes.
    configured: matrixEnabled,
    build: (env) =>
      new MatrixAdapter({
        transport: matrixTransport(env.VANTA_MATRIX_HOMESERVER!.trim(), env.VANTA_MATRIX_TOKEN!.trim()),
        selfUserId: env.VANTA_MATRIX_USER_ID?.trim() || undefined,
        allow: parseMatrixAllowlist(env),
      }),
  },
  line: {
    // LINE: channel access token (inbound arrives via the channel webhook); replies
    // PUSH back keyed by the source id (msg.chatId).
    configured: lineEnabled,
    build: (env) =>
      new LineAdapter({
        transport: lineTransport(env.VANTA_LINE_TOKEN!.trim()),
        allow: parseLineAllowlist(env),
      }),
  },
};

/** Ids of every platform with a live adapter in this factory (registration order). */
export function implementedPlatformIds(): string[] {
  return Object.keys(ADAPTERS);
}

export type CreateAdapterError = { ok: false; error: string };

/**
 * Build one messaging adapter by id from env. Errors-as-values: returns a clear
 * miss when the id has no live adapter, or when the adapter exists but its env
 * isn't configured. Mirrors how `resolveProvider` maps an id → a concrete LLM.
 */
export function createAdapter(
  id: string,
  env: NodeJS.ProcessEnv,
): PlatformAdapter | CreateAdapterError {
  const entry = ADAPTERS[id];
  if (!entry) {
    return {
      ok: false,
      error: `No messaging adapter for "${id}". Implemented: ${implementedPlatformIds().join(", ")}.`,
    };
  }
  if (!entry.configured(env)) {
    return { ok: false, error: `Messaging platform "${id}" is not configured (missing required env).` };
  }
  return entry.build(env);
}

/**
 * Resolve the live messaging adapter for `vanta gateway` from env: the first
 * configured platform in registration order (telegram > mattermost > irc > ntfy
 * > imessage > signal). Returns undefined when nothing is configured — the
 * gateway then runs cron/webhook only. The env analogue of `resolveProvider`.
 */
export function resolveMessagingAdapter(env: NodeJS.ProcessEnv): PlatformAdapter | undefined {
  for (const [id, entry] of Object.entries(ADAPTERS)) {
    if (entry.configured(env)) {
      const built = createAdapter(id, env);
      // configured() just returned true, so build() succeeds; the guard is only
      // a type-narrowing belt to keep the return PlatformAdapter | undefined.
      if (!("ok" in built)) return built;
    }
  }
  return undefined;
}

/** Build EVERY configured messaging adapter (registration order). MSG-MULTICHANNEL-LIVE. */
export function resolveMessagingAdapters(env: NodeJS.ProcessEnv): PlatformAdapter[] {
  const out: PlatformAdapter[] = [];
  for (const [id, entry] of Object.entries(ADAPTERS)) {
    if (!entry.configured(env)) continue;
    const built = createAdapter(id, env);
    if (!("ok" in built)) out.push(built);
  }
  return out;
}

/**
 * The live messaging channel for `vanta gateway`: nothing configured → undefined;
 * one channel → that adapter (un-tagged, back-compat); 2+ → a MultiChannelAdapter
 * that polls all and routes replies back to the originating channel.
 */
export function resolveMessagingChannel(env: NodeJS.ProcessEnv): PlatformAdapter | undefined {
  const all = resolveMessagingAdapters(env);
  if (all.length === 0) return undefined;
  if (all.length === 1) return all[0];
  return new MultiChannelAdapter(all);
}
