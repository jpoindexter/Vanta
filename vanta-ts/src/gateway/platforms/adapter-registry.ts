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
import { TeamsAdapter, httpTransport as teamsTransport, parseTeamsAllowlist, teamsEnabled } from "./teams.js";
import { TwitchAdapter, httpTransport as twitchTransport, parseTwitchAllowlist, twitchEnabled } from "./twitch.js";
import { SmsAdapter, httpTransport as smsTransport, parseSmsAllowlist, smsEnabled } from "./sms.js";
import { ZaloAdapter, httpTransport as zaloTransport, parseZaloAllowlist, zaloEnabled } from "./zalo.js";
import { FeishuAdapter, httpTransport as feishuTransport, parseFeishuAllowlist, feishuEnabled } from "./feishu.js";
import { WebChatAdapter, createWebChatBuffer, parseWebChatAllowlist, webchatEnabled } from "./webchat.js";
import {
  NostrAdapter,
  httpTransport as nostrTransport,
  parseNostrAllowlist,
  parseNostrRelays,
  nostrEnabled,
} from "./nostr.js";
import {
  GoogleChatAdapter,
  serviceAccountTransport as googleChatTransport,
  parseGoogleChatAllowlist,
  googleChatEnabled,
} from "./google-chat.js";
import { EmailAdapter, imapSmtpTransport, build as emailConfig, parseEmailAllowlist, emailEnabled } from "./email.js";

// The messaging adapter registration table — one { configured, build } entry per
// platform. Adding a platform = one entry here + its adapter file; `factory.ts`
// is the resolution layer over this map. Iteration order = priority order for
// `resolveMessagingAdapter`. The setup-wizard metadata lives in `registry.ts`.

const SIGNAL_NUMBER_ENV = "VANTA_SIGNAL_NUMBER";

/** One registration entry per implemented platform. */
export type AdapterEntry = {
  /** True when every env var this adapter needs is present (non-blank). */
  configured: (env: NodeJS.ProcessEnv) => boolean;
  /** Build the concrete adapter from env. Only called when `configured`. */
  build: (env: NodeJS.ProcessEnv) => PlatformAdapter;
};

const has = (env: NodeJS.ProcessEnv, key: string): boolean => Boolean(env[key]?.trim());

export const ADAPTERS: Record<string, AdapterEntry> = {
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
    // Needs the signal-cli daemon URL (catalog-required) AND the linked number.
    configured: (env) => has(env, "VANTA_SIGNAL_URL") && has(env, SIGNAL_NUMBER_ENV),
    build: (env) =>
      new SignalAdapter({
        baseUrl: env.VANTA_SIGNAL_URL!.trim(),
        number: env[SIGNAL_NUMBER_ENV]!.trim(),
      }),
  },
  whatsapp: {
    // WhatsApp Cloud API: access token + sender phone-number id. Inbound webhook-fed.
    configured: (env) => has(env, "VANTA_WHATSAPP_TOKEN") && has(env, "VANTA_WHATSAPP_PHONE_ID"),
    build: (env) =>
      new WhatsappAdapter({
        transport: whatsappTransport(env.VANTA_WHATSAPP_TOKEN!.trim(), env.VANTA_WHATSAPP_PHONE_ID!.trim()),
        allow: parseWhatsappAllowlist(env),
      }),
  },
  slack: {
    // Slack: bot token for chat.postMessage; inbound via the Events API webhook.
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
    // Matrix: homeserver URL + access token; replies route back to the room (chatId).
    configured: matrixEnabled,
    build: (env) =>
      new MatrixAdapter({
        transport: matrixTransport(env.VANTA_MATRIX_HOMESERVER!.trim(), env.VANTA_MATRIX_TOKEN!.trim()),
        selfUserId: env.VANTA_MATRIX_USER_ID?.trim() || undefined,
        allow: parseMatrixAllowlist(env),
      }),
  },
  line: {
    // LINE: channel access token (inbound via webhook); replies PUSH back by chatId.
    configured: lineEnabled,
    build: (env) =>
      new LineAdapter({
        transport: lineTransport(env.VANTA_LINE_TOKEN!.trim()),
        allow: parseLineAllowlist(env),
      }),
  },
  teams: {
    // Microsoft Teams (Bot Framework): app id + password; token minted internally.
    // Inbound webhook-fed; send routes by the conversation serviceUrl seen on poll.
    configured: teamsEnabled,
    build: (env) =>
      new TeamsAdapter({
        transport: teamsTransport(env.VANTA_TEAMS_APP_ID!.trim(), env.VANTA_TEAMS_APP_PASSWORD!.trim()),
        allow: parseTeamsAllowlist(env),
      }),
  },
  twitch: {
    // Twitch chat (IRC over WebSocket): oauth token + nick + channel.
    configured: twitchEnabled,
    build: (env) =>
      new TwitchAdapter({
        transport: twitchTransport(
          env.VANTA_TWITCH_TOKEN!.trim(),
          env.VANTA_TWITCH_NICK!.trim(),
          env.VANTA_TWITCH_CHANNEL!.trim(),
        ),
        channel: env.VANTA_TWITCH_CHANNEL!.trim(),
        allow: parseTwitchAllowlist(env),
      }),
  },
  sms: {
    // SMS via Twilio REST: account sid + auth token + sender number. Inbound webhook-fed.
    configured: smsEnabled,
    build: (env) =>
      new SmsAdapter({
        transport: smsTransport(env.VANTA_TWILIO_SID!.trim(), env.VANTA_TWILIO_TOKEN!.trim(), env.VANTA_TWILIO_FROM!.trim()),
        allow: parseSmsAllowlist(env),
      }),
  },
  zalo: {
    // Zalo Official Account: OA access token. Inbound webhook-fed.
    configured: zaloEnabled,
    build: (env) =>
      new ZaloAdapter({
        transport: zaloTransport(env.VANTA_ZALO_TOKEN!.trim()),
        allow: parseZaloAllowlist(env),
      }),
  },
  feishu: {
    // Feishu / Lark: app id + secret; tenant_access_token minted internally. Inbound webhook-fed.
    configured: feishuEnabled,
    build: (env) =>
      new FeishuAdapter({
        transport: feishuTransport(env.VANTA_FEISHU_APP_ID!.trim(), env.VANTA_FEISHU_APP_SECRET!.trim()),
        allow: parseFeishuAllowlist(env),
      }),
  },
  webchat: {
    // Local self-hosted web chat: an in-memory buffer the gateway HTTP endpoint feeds.
    configured: webchatEnabled,
    build: (env) =>
      new WebChatAdapter({
        buffer: createWebChatBuffer(),
        allow: parseWebChatAllowlist(env),
      }),
  },
  nostr: {
    // Nostr: hex secret key + relay list; events schnorr-signed via @noble/curves.
    configured: nostrEnabled,
    build: (env) =>
      new NostrAdapter({
        transport: nostrTransport(env.VANTA_NOSTR_PRIVKEY!.trim(), parseNostrRelays(env)),
        allow: parseNostrAllowlist(env),
      }),
  },
  googlechat: {
    // Google Chat: service-account JSON; Chat-bot bearer token minted + cached internally.
    configured: googleChatEnabled,
    build: (env) =>
      new GoogleChatAdapter({
        transport: googleChatTransport(env.VANTA_GOOGLECHAT_SA!.trim()),
        allow: parseGoogleChatAllowlist(env),
      }),
  },
  email: {
    // Email: IMAP receive + SMTP send (nodemailer + imapflow, dynamic-imported).
    configured: emailEnabled,
    build: (env) =>
      new EmailAdapter({
        transport: imapSmtpTransport(emailConfig(env)),
        allow: parseEmailAllowlist(env),
      }),
  },
};
