// Messaging platform registry — the catalog the setup wizard, gateway, and
// `vanta doctor` read to know which messaging gateways exist, what each needs,
// and whether it's configured. Mirrors providers/catalog.ts. Adding a platform
// = one entry here + its PlatformAdapter file; nothing central to edit.
//
// `implemented` is the honesty flag: only Telegram has a live adapter today, so
// the wizard *configures* Telegram and only *previews* the planned ones — it
// never writes an enable flag for an adapter that doesn't exist yet.

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
    implemented: false,
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
    implemented: false,
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
    label: "WhatsApp (unofficial bridge)",
    implemented: false,
    requiredEnv: ["VANTA_WHATSAPP_ENABLE"],
    enableEnv: { VANTA_WHATSAPP_ENABLE: "1" },
    prerequisite: "Node installed; a one-time QR pair from your phone.",
    warning:
      "Unofficial — risks WhatsApp account bans and breaks on protocol changes. The WhatsApp Business API is the ToS-safe path for a real account.",
    setupSteps: [
      "Ensure Node is installed (the bridge runs as a subprocess).",
      "Start the gateway, then scan the QR shown in the logs from WhatsApp → Linked Devices.",
      "Credentials are stored in ~/.vanta/whatsapp/ (outside the repo).",
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
