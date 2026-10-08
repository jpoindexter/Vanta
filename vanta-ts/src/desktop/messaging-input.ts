import type { MessagingPlatform } from "../gateway/platforms/registry.js";
import { validateTelegramAllowlist, validateTelegramToken } from "../setup-messaging.js";

export function labelForEnv(key: string): string {
  return key.replace(/^VANTA_/, "").toLowerCase().split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function trimmedValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function messagingCredentialUpdates(platform: MessagingPlatform, values: unknown, env: NodeJS.ProcessEnv) {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Credential values are required.");
  const supplied = values as Record<string, unknown>;
  const updates: Record<string, string> = { ...(platform.enableEnv ?? {}) };
  for (const key of platform.requiredEnv) {
    const value = trimmedValue(supplied[key]);
    if (value) {
      if ((supplied[key] as string).length > 16_000) throw new Error(`${labelForEnv(key)} is too long.`);
      updates[key] = value;
    } else if (!env[key]?.trim()) throw new Error(`${labelForEnv(key)} is required.`);
  }
  return { supplied, updates };
}

function telegramAllow(supplied: Record<string, unknown>, env: NodeJS.ProcessEnv): string | undefined {
  const mode = supplied.accessMode;
  if (mode !== "pairing" && mode !== "allowlist") throw new Error("Choose how new Telegram chats are authorized.");
  if (mode === "pairing") return "";
  const allow = trimmedValue(supplied.VANTA_TELEGRAM_ALLOW);
  const effective = allow || env.VANTA_TELEGRAM_ALLOW?.trim() || "";
  if (!effective) throw new Error("Enter at least one Telegram chat ID for allowlist access.");
  if (!validateTelegramAllowlist(effective)) throw new Error("Telegram chat IDs must be comma-separated numbers.");
  return allow ? allow.replace(/\s+/g, "") : undefined;
}

export function validateTelegramUpdates(supplied: Record<string, unknown>, updates: Record<string, string>, env: NodeJS.ProcessEnv): void {
  const allow = telegramAllow(supplied, env);
  if (allow !== undefined) updates.VANTA_TELEGRAM_ALLOW = allow;
  const token = updates.VANTA_TELEGRAM_TOKEN ?? env.VANTA_TELEGRAM_TOKEN ?? "";
  if (!validateTelegramToken(token)) throw new Error("Telegram token format is invalid. Paste the complete HTTP API token from @BotFather.");
}
