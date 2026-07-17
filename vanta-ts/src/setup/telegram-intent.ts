export function isTelegramSetupQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/telgram/g, "telegram");
  return /\btelegram\b/.test(normalized)
    && /\b(set\s*up|setup|configure|connect|command|wizard)\b/.test(normalized);
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
