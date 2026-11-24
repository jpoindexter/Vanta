/** Question forms must stay in the model path instead of opening setup UI. */
const INTERROGATIVE = /^\s*(what|what's|whats|how|why|where|which|who|when|is|are|was|were|does|do|did|can|could|should|would|will|any|tell|show|explain)\b/;

/** Verbs that make a Telegram message an actionable setup/repair request. */
const SETUP_VERB = /\b(set\s*up|setup|configure|reconnect|connect|fix|repair)\b/;

function normalize(text: string): string {
  return text.toLowerCase().replace(/telgram/g, "telegram");
}

/** True when the message names Telegram and asks to configure or repair it. */
export function mentionsTelegramSetup(text: string): boolean {
  const normalized = normalize(text);
  return /\btelegram\b/.test(normalized) && SETUP_VERB.test(normalized);
}

/** True only for a direct Telegram setup/repair instruction. */
export function isTelegramSetupQuestion(text: string): boolean {
  if (!mentionsTelegramSetup(text)) return false;
  return !text.includes("?") && !INTERROGATIVE.test(normalize(text));
}

export function isTelegramSetupCommand(text: string): boolean {
  return /^\/setup\s+(?:messaging|telegram)\s*$/i.test(text.trim());
}

export type DesktopSetupTarget =
  | { section: "overview" }
  | { section: "messaging"; platformId?: string }
  | { section: "mcp" }
  | { section: "model" }
  | { section: "unknown"; value: string };

/** Parse desktop setup commands without sending them to the model. */
export function parseDesktopSetupCommand(text: string): DesktopSetupTarget | null {
  const match = /^\/setup(?:\s+(.+?))?\s*$/i.exec(text.trim());
  if (!match) return null;
  const value = match[1]?.trim().toLowerCase() ?? "";
  if (!value) return { section: "overview" };
  if (value === "model" || value === "models" || value === "provider") return { section: "model" };
  if (value === "mcp" || value === "tools") return { section: "mcp" };
  if (value === "messaging" || value === "channels") return { section: "messaging" };
  if (value === "telegram" || value === "telgram") return { section: "messaging", platformId: "telegram" };
  return { section: "unknown", value };
}
