// Messaging platform registry — the catalog the setup wizard, gateway, and
// `vanta doctor` read to know which messaging gateways exist, what each needs,
// and whether it's configured. Mirrors providers/catalog.ts. Adding a platform
// = one entry here + its PlatformAdapter file; nothing central to edit.
//
// `implemented` is the honesty flag: the wizard *configures* a platform only
// when it has a live PlatformAdapter, and *previews* any that don't — it never
// writes an enable flag for an adapter that doesn't exist. All 20 platforms here
// are implemented today (see adapter-registry.ts); the flag stays so a future
// preview-only catalog entry degrades safely.

export type MessagingPlatform = {
  /** Stable id (matches the PlatformAdapter id). */
  id: string;
  label: string;
  /** True once a live PlatformAdapter is wired. false = planned (preview only). */
  implemented: boolean;
  /** Env vars that must ALL be set for the platform to be usable. */
  requiredEnv: string[];
  /** Env var prompted as a hidden secret (e.g. a bot token), if any. */
  secretEnv?: string;
  /** Non-secret env keys written when the platform is enabled. */
  enableEnv?: Record<string, string>;
  /** Runtime/OS prerequisite the user satisfies outside Vanta. */
  prerequisite?: string;
  /** Risk warning shown before enabling (e.g. WhatsApp ban risk). */
  warning?: string;
  /** Ordered human setup/pairing steps. */
  setupSteps: string[];
  /** Where to get credentials / the tool. */
  signupUrl?: string;
};

export const MESSAGING_CATALOG: MessagingPlatform[] = [
  {
    id: "telegram",
    label: "Telegram",
    implemented: true,
    requiredEnv: ["VANTA_TELEGRAM_TOKEN"],
    secretEnv: "VANTA_TELEGRAM_TOKEN",
    signupUrl: "https://t.me/BotFather",
    setupSteps: [
      "Open @BotFather in Telegram.",
      "Send /newbot and follow the prompts to name your bot.",
      "Copy the HTTP API token BotFather gives you.",
      "Paste it here. Optionally set VANTA_TELEGRAM_ALLOW to a comma list of chat ids.",
    ],
  },
  {
    id: "imessage",
    label: "iMessage (native macOS)",
    implemented: true,
    requiredEnv: ["VANTA_IMESSAGE_ENABLE"],
    enableEnv: { VANTA_IMESSAGE_ENABLE: "1" },
    prerequisite:
      "macOS Full Disk Access (read ~/Library/Messages/chat.db) + Automation permission (control Messages).",
    setupSteps: [
      "System Settings → Privacy & Security → Full Disk Access → enable your terminal/Vanta.",
      "System Settings → Privacy & Security → Automation → allow control of Messages.",
      "Be signed into iMessage in the Messages app on this Mac.",
    ],
  },
  {
    id: "signal",
    label: "Signal (signal-cli)",
    implemented: true,
    requiredEnv: ["VANTA_SIGNAL_URL"],
    prerequisite: "signal-cli installed, your number linked/registered, running in daemon http mode.",
    signupUrl: "https://github.com/AsamK/signal-cli",
    setupSteps: [
      "Install signal-cli and link/register your number.",
      "Run: signal-cli daemon --http (note the localhost URL).",
      "Set VANTA_SIGNAL_URL to that daemon URL.",
    ],
  },
  {
    id: "whatsapp",
    label: "WhatsApp (Cloud API)",
    implemented: true,
    requiredEnv: ["VANTA_WHATSAPP_TOKEN", "VANTA_WHATSAPP_PHONE_ID"],
    secretEnv: "VANTA_WHATSAPP_TOKEN",
    signupUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
    prerequisite: "A Meta WhatsApp Business app with the Cloud API enabled (a phone-number id + access token).",
    setupSteps: [
      "Create a Meta app, add the WhatsApp product, and note the test/real phone-number id.",
      "Generate a Cloud API access token (a permanent system-user token for production).",
      "Set VANTA_WHATSAPP_TOKEN (the token) + VANTA_WHATSAPP_PHONE_ID (the sender phone-number id).",
      "Point the WhatsApp webhook at your gateway's webhook URL so inbound messages reach Vanta.",
      "Optionally set VANTA_WHATSAPP_ALLOWLIST to a comma list of wa_ids to accept.",
    ],
  },
  {
    id: "slack", label: "Slack", implemented: true,
    requiredEnv: ["VANTA_SLACK_BOT_TOKEN"], secretEnv: "VANTA_SLACK_BOT_TOKEN",
    signupUrl: "https://api.slack.com/apps",
    setupSteps: [
      "Create a Slack app at api.slack.com/apps.",
      "Add bot scopes (chat:write, app_mentions:read, im:history) and install to your workspace.",
      "Set VANTA_SLACK_BOT_TOKEN (xoxb-…).",
      "Enable Event Subscriptions and point the request URL at your gateway's webhook so inbound messages reach Vanta.",
      "Optionally set VANTA_SLACK_ALLOWLIST to a comma list of channel ids to accept.",
    ],
  },
  {
    id: "discord", label: "Discord", implemented: true,
    requiredEnv: ["VANTA_DISCORD_TOKEN", "VANTA_DISCORD_CHANNEL"], secretEnv: "VANTA_DISCORD_TOKEN",
    signupUrl: "https://discord.com/developers/applications",
    setupSteps: [
      "Create an application + bot in the Discord Developer Portal.",
      "Enable the MESSAGE CONTENT intent under Bot → Privileged Gateway Intents.",
      "Invite the bot to your server, then set VANTA_DISCORD_TOKEN.",
      "Set VANTA_DISCORD_CHANNEL to the channel id the bot reads/replies in.",
      "Optionally set VANTA_DISCORD_ALLOWLIST to a comma list of channel/user ids.",
    ],
  },
  {
    id: "matrix", label: "Matrix", implemented: true,
    requiredEnv: ["VANTA_MATRIX_HOMESERVER", "VANTA_MATRIX_TOKEN"], secretEnv: "VANTA_MATRIX_TOKEN",
    setupSteps: [
      "Pick a homeserver (matrix.org or self-hosted) and create a bot account.",
      "Get an access token for that account.",
      "Set VANTA_MATRIX_HOMESERVER (https URL) and VANTA_MATRIX_TOKEN.",
    ],
  },
  {
    id: "email", label: "Email (IMAP + SMTP)", implemented: true,
    requiredEnv: ["VANTA_EMAIL_IMAP", "VANTA_EMAIL_SMTP", "VANTA_EMAIL_USER", "VANTA_EMAIL_PASS"], secretEnv: "VANTA_EMAIL_PASS",
    setupSteps: [
      "Get IMAP + SMTP host/port for your mailbox (an app password for Gmail/Outlook).",
      "Set VANTA_EMAIL_IMAP, VANTA_EMAIL_SMTP, VANTA_EMAIL_USER, VANTA_EMAIL_PASS.",
    ],
  },
  {
    id: "teams", label: "Microsoft Teams", implemented: true,
    requiredEnv: ["VANTA_TEAMS_APP_ID", "VANTA_TEAMS_APP_PASSWORD"], secretEnv: "VANTA_TEAMS_APP_PASSWORD",
    signupUrl: "https://dev.teams.microsoft.com",
    setupSteps: [
      "Register an Azure Bot + Teams app (Bot Framework).",
      "Set VANTA_TEAMS_APP_ID and VANTA_TEAMS_APP_PASSWORD; expose the messaging endpoint.",
    ],
  },
  {
    id: "mattermost", label: "Mattermost", implemented: true,
    requiredEnv: ["VANTA_MATTERMOST_URL", "VANTA_MATTERMOST_TOKEN", "VANTA_MATTERMOST_CHANNEL"],
    secretEnv: "VANTA_MATTERMOST_TOKEN",
    setupSteps: [
      "Create a bot account in your Mattermost (System Console → Integrations → Bot Accounts) and copy its token.",
      "Add the bot to the channel you want it to watch, then copy that channel's id (Channel menu → View Info).",
      "Set VANTA_MATTERMOST_URL (server URL), VANTA_MATTERMOST_TOKEN (the bot token), and VANTA_MATTERMOST_CHANNEL (the channel id).",
      "Optional: set VANTA_MATTERMOST_ALLOW to a comma list of channel ids to accept (default: allow all).",
    ],
  },
  {
    id: "googlechat", label: "Google Chat", implemented: true,
    requiredEnv: ["VANTA_GOOGLECHAT_SA"], secretEnv: "VANTA_GOOGLECHAT_SA",
    setupSteps: [
      "Enable the Google Chat API in a Google Cloud project; create a service account.",
      "Set VANTA_GOOGLECHAT_SA to the service-account JSON content.",
    ],
  },
  {
    id: "irc", label: "IRC", implemented: true,
    requiredEnv: ["VANTA_IRC_SERVER", "VANTA_IRC_NICK", "VANTA_IRC_CHANNEL"],
    setupSteps: [
      "Pick an IRC server (host:port, e.g. irc.libera.chat:6667), a nick, and a channel.",
      "Set VANTA_IRC_SERVER (host:port), VANTA_IRC_NICK, and VANTA_IRC_CHANNEL (e.g. #vanta).",
      "Optional: set VANTA_IRC_ALLOW to a comma list of nicks to accept (default: allow all).",
    ],
  },
  {
    id: "ntfy", label: "ntfy (push notifications)", implemented: true,
    requiredEnv: ["VANTA_NTFY_TOPIC"],
    signupUrl: "https://ntfy.sh",
    setupSteps: [
      "Pick a topic name on ntfy.sh (or self-host); subscribe to it in the ntfy app.",
      "Set VANTA_NTFY_TOPIC to that topic name (not the full URL).",
      "Optional: set VANTA_NTFY_SERVER for a self-hosted server (default https://ntfy.sh).",
      "Optional: set VANTA_NTFY_ALLOW to a comma list of topics to accept (default: allow all).",
    ],
  },
  {
    id: "line", label: "LINE", implemented: true,
    requiredEnv: ["VANTA_LINE_TOKEN", "VANTA_LINE_SECRET"], secretEnv: "VANTA_LINE_TOKEN",
    signupUrl: "https://developers.line.biz",
    setupSteps: [
      "Create a LINE Messaging API channel in the LINE Developers console.",
      "Set VANTA_LINE_TOKEN (channel access token) and VANTA_LINE_SECRET.",
    ],
  },
  {
    id: "twitch", label: "Twitch chat", implemented: true,
    requiredEnv: ["VANTA_TWITCH_TOKEN", "VANTA_TWITCH_NICK", "VANTA_TWITCH_CHANNEL"], secretEnv: "VANTA_TWITCH_TOKEN",
    signupUrl: "https://dev.twitch.tv/console",
    setupSteps: [
      "Get a chat OAuth token (without the oauth: prefix) for your bot account.",
      "Set VANTA_TWITCH_TOKEN, VANTA_TWITCH_NICK (bot login), and VANTA_TWITCH_CHANNEL (e.g. #channel).",
    ],
  },
  {
    id: "sms", label: "SMS (Twilio)", implemented: true,
    requiredEnv: ["VANTA_TWILIO_SID", "VANTA_TWILIO_TOKEN", "VANTA_TWILIO_FROM"], secretEnv: "VANTA_TWILIO_TOKEN",
    signupUrl: "https://www.twilio.com/console",
    setupSteps: [
      "Get your Twilio Account SID + Auth Token and a sending number.",
      "Set VANTA_TWILIO_SID, VANTA_TWILIO_TOKEN, VANTA_TWILIO_FROM; point the number's inbound webhook at the gateway.",
    ],
  },
  {
    id: "zalo", label: "Zalo OA", implemented: true,
    requiredEnv: ["VANTA_ZALO_TOKEN"], secretEnv: "VANTA_ZALO_TOKEN",
    signupUrl: "https://developers.zalo.me",
    setupSteps: [
      "Create a Zalo Official Account app and get its OA access token.",
      "Set VANTA_ZALO_TOKEN; point the OA webhook at the gateway.",
    ],
  },
  {
    id: "feishu", label: "Feishu / Lark", implemented: true,
    requiredEnv: ["VANTA_FEISHU_APP_ID", "VANTA_FEISHU_APP_SECRET"], secretEnv: "VANTA_FEISHU_APP_SECRET",
    signupUrl: "https://open.feishu.cn",
    setupSteps: [
      "Create a Feishu/Lark app; enable the im:message bot scopes + event subscription.",
      "Set VANTA_FEISHU_APP_ID and VANTA_FEISHU_APP_SECRET; point the event webhook at the gateway.",
    ],
  },
  {
    id: "qq", label: "QQ (官方机器人)", implemented: true,
    requiredEnv: ["VANTA_QQ_APP_ID", "VANTA_QQ_APP_SECRET"], secretEnv: "VANTA_QQ_APP_SECRET",
    signupUrl: "https://bot.q.qq.com",
    setupSteps: [
      "Create a QQ bot on the 官方机器人 platform (bot.q.qq.com) and get its AppID + AppSecret.",
      "Enable the group @-message event; set the callback (webhook) URL to the gateway.",
      "Set VANTA_QQ_APP_ID and VANTA_QQ_APP_SECRET (optional VANTA_QQ_ALLOWLIST of group/member openids).",
    ],
  },
  {
    id: "wechat", label: "WeChat (公众号)", implemented: true,
    requiredEnv: ["VANTA_WECHAT_APP_ID", "VANTA_WECHAT_APP_SECRET"], secretEnv: "VANTA_WECHAT_APP_SECRET",
    signupUrl: "https://mp.weixin.qq.com",
    setupSteps: [
      "Create a WeChat Official Account (公众号) and get its AppID + AppSecret.",
      "Configure the server URL (message webhook) to the gateway and verify it.",
      "Set VANTA_WECHAT_APP_ID and VANTA_WECHAT_APP_SECRET (optional VANTA_WECHAT_ALLOWLIST of openids).",
    ],
  },
  {
    id: "webchat", label: "WebChat (self-hosted)", implemented: true,
    requiredEnv: ["VANTA_WEBCHAT_ENABLE"], enableEnv: { VANTA_WEBCHAT_ENABLE: "1" },
    setupSteps: [
      "Set VANTA_WEBCHAT_ENABLE=1 to enable the local web chat surface.",
      "Open the gateway's web chat endpoint in a browser to message Vanta.",
    ],
  },
  {
    id: "nostr", label: "Nostr", implemented: true,
    requiredEnv: ["VANTA_NOSTR_PRIVKEY", "VANTA_NOSTR_RELAYS"], secretEnv: "VANTA_NOSTR_PRIVKEY",
    setupSteps: [
      "Generate a Nostr secret key (hex) and pick one or more wss:// relays.",
      "Set VANTA_NOSTR_PRIVKEY (hex) and VANTA_NOSTR_RELAYS (comma-separated relay URLs).",
    ],
  },
];

export function messagingPlatformById(id: string): MessagingPlatform | undefined {
  return MESSAGING_CATALOG.find((p) => p.id === id);
}

export type Availability = { configured: boolean; missing: string[] };

/** Which required env vars are absent. `configured` = none missing. Pure. */
export function platformAvailability(
  platform: MessagingPlatform,
  env: NodeJS.ProcessEnv,
): Availability {
  const missing = platform.requiredEnv.filter((k) => !env[k] || !env[k]!.trim());
  return { configured: missing.length === 0, missing };
}
