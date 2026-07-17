import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readCanvasArtifact } from "../canvas/artifact.js";
import { MESSAGING_CATALOG, messagingPlatformById, platformAvailability } from "../gateway/platforms/registry.js";
import { upsertEnvMigratingLegacy } from "../setup.js";
import { probeMessaging } from "../setup/assistant.js";
import { validateTelegramAllowlist, validateTelegramToken } from "../setup-messaging.js";
import { listAllSessions, loadSession } from "../sessions/store.js";
import { listSkills } from "../skills/store.js";

export type DesktopCapability = {
  id: string;
  kind: "tool" | "skill";
  name: string;
  description: string;
  tags: string[];
};

export type DesktopMessagingPlatform = {
  id: string;
  label: string;
  status: "ready" | "needs_setup" | "unavailable";
  configured: boolean;
  missing: string[];
  prerequisite?: string;
  warning?: string;
  setupSteps: string[];
  signupUrl?: string;
  accessMode?: "pairing" | "allowlist";
  allowedCount?: number;
  fields: { key: string; label: string; secret: boolean; required: boolean }[];
};

export type DesktopArtifact = {
  id: string;
  kind: "canvas" | "link" | "file";
  label: string;
  value: string;
  sessionId?: string;
  sessionTitle?: string;
};

export async function desktopCapabilities(tools: { name: string; description: string }[]): Promise<DesktopCapability[]> {
  const skillRows = await listSkills(process.env).catch(() => []);
  return [
    ...tools.map((tool) => ({ id: `tool:${tool.name}`, kind: "tool" as const, name: tool.name, description: tool.description, tags: ["Vanta tool"] })),
    ...skillRows.map((skill) => ({ id: `skill:${skill.meta.name}`, kind: "skill" as const, name: skill.meta.name, description: skill.meta.description || "Project skill", tags: skill.meta.tags ?? [] })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

export function desktopMessagingPlatforms(env: NodeJS.ProcessEnv = process.env): DesktopMessagingPlatform[] {
  return MESSAGING_CATALOG.map((platform) => {
    const availability = platformAvailability(platform, env);
    return {
      id: platform.id,
      label: platform.label,
      status: !platform.implemented ? "unavailable" : availability.configured ? "ready" : "needs_setup",
      configured: availability.configured,
      missing: availability.missing,
      prerequisite: platform.prerequisite,
      warning: platform.warning,
      setupSteps: platform.setupSteps,
      signupUrl: platform.signupUrl,
      ...(platform.id === "telegram" ? {
        accessMode: env.VANTA_TELEGRAM_ALLOW?.trim() ? "allowlist" as const : "pairing" as const,
        allowedCount: env.VANTA_TELEGRAM_ALLOW?.split(",").filter((id) => id.trim()).length ?? 0,
      } : {}),
      fields: platform.requiredEnv.map((key) => ({ key, label: labelForEnv(key), secret: key === platform.secretEnv, required: true })),
    };
  });
}

type MessagingProbeDeps = { probe?: typeof probeMessaging };

export async function testDesktopMessagingPlatform(id: string, env: NodeJS.ProcessEnv = process.env, deps: MessagingProbeDeps = {}): Promise<{ status: DesktopMessagingPlatform["status"]; message: string }> {
  const platform = desktopMessagingPlatforms(env).find((item) => item.id === id);
  if (!platform) throw new Error("Messaging platform was not found.");
  if (platform.status === "unavailable") return { status: "unavailable", message: `${platform.label} is not available in this Vanta build.` };
  if (platform.status === "needs_setup") return { status: "needs_setup", message: `${platform.label} still needs ${platform.missing.length} required setting${platform.missing.length === 1 ? "" : "s"}.` };
  if (id === "telegram") {
    const check = await (deps.probe ?? probeMessaging)(env);
    return check.ok
      ? { status: "ready", message: `${check.detail}. The bot credential is live.` }
      : { status: "needs_setup", message: `Telegram could not verify the saved bot: ${check.detail}` };
  }
  return { status: "ready", message: `${platform.label} credentials are saved locally and ready for the gateway.` };
}

export async function saveDesktopMessagingPlatform(root: string, id: string, values: unknown, deps: MessagingProbeDeps = {}): Promise<DesktopMessagingPlatform> {
  const platform = messagingPlatformById(id);
  if (!platform?.implemented) throw new Error("Messaging platform is not available.");
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Credential values are required.");
  const supplied = values as Record<string, unknown>;
  const updates: Record<string, string> = { ...(platform.enableEnv ?? {}) };
  for (const key of platform.requiredEnv) {
    const value = supplied[key];
    if (typeof value === "string" && value.trim()) {
      if (value.length > 16_000) throw new Error(`${labelForEnv(key)} is too long.`);
      updates[key] = value.trim();
    } else if (!process.env[key]?.trim()) {
      throw new Error(`${labelForEnv(key)} is required.`);
    }
  }
  if (id === "telegram") {
    const accessMode = supplied.accessMode;
    const allow = typeof supplied.VANTA_TELEGRAM_ALLOW === "string" ? supplied.VANTA_TELEGRAM_ALLOW.trim() : "";
    if (accessMode !== "pairing" && accessMode !== "allowlist") throw new Error("Choose how new Telegram chats are authorized.");
    if (accessMode === "allowlist") {
      const effectiveAllow = allow || process.env.VANTA_TELEGRAM_ALLOW?.trim() || "";
      if (!effectiveAllow) throw new Error("Enter at least one Telegram chat ID for allowlist access.");
      if (!validateTelegramAllowlist(effectiveAllow)) throw new Error("Telegram chat IDs must be comma-separated numbers.");
      if (allow) updates.VANTA_TELEGRAM_ALLOW = allow.replace(/\s+/g, "");
    } else {
      updates.VANTA_TELEGRAM_ALLOW = "";
    }
    const token = updates.VANTA_TELEGRAM_TOKEN ?? process.env.VANTA_TELEGRAM_TOKEN ?? "";
    if (!validateTelegramToken(token)) throw new Error("Telegram token format is invalid. Paste the complete HTTP API token from @BotFather.");
    const check = await (deps.probe ?? probeMessaging)({ ...process.env, ...updates });
    if (!check.ok) throw new Error(`Telegram verification failed: ${check.detail}. Nothing was saved.`);
  }
  const path = join(root, ".vanta", ".env");
  await mkdir(join(root, ".vanta"), { recursive: true });
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  await writeFile(path, upsertEnvMigratingLegacy(existing, updates), { mode: 0o600 });
  Object.assign(process.env, updates);
  const saved = desktopMessagingPlatforms(process.env).find((item) => item.id === id);
  if (!saved) throw new Error("Messaging platform was not found after saving.");
  return saved;
}

export async function desktopArtifacts(root: string): Promise<DesktopArtifact[]> {
  const artifacts: DesktopArtifact[] = [];
  const canvas = await readCanvasArtifact(root).catch(() => null);
  if (canvas) artifacts.push({ id: `canvas:${canvas.id}`, kind: "canvas", label: canvas.title, value: canvas.kind, sessionId: canvas.sessionId });
  const sessions = await listAllSessions(process.env);
  const seen = new Set(artifacts.map((item) => item.id));
  for (const meta of sessions) {
    const session = await loadSession(meta.id, process.env);
    if (!session) continue;
    for (const message of session.messages) {
      if (message.role !== "assistant" && message.role !== "tool") continue;
      for (const url of extractUrls(message.content)) addUnique(artifacts, seen, { id: `link:${meta.id}:${url}`, kind: "link", label: url, value: url, sessionId: meta.id, sessionTitle: meta.title });
      for (const path of extractProjectFiles(root, message.content)) addUnique(artifacts, seen, { id: `file:${meta.id}:${path}`, kind: "file", label: path, value: path, sessionId: meta.id, sessionTitle: meta.title });
    }
  }
  return artifacts;
}

function labelForEnv(key: string): string {
  return key.replace(/^VANTA_/, "").toLowerCase().split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function extractUrls(content: string): string[] {
  return [...content.matchAll(/https?:\/\/[^\s<>"')\]]+/g)].map((match) => match[0]);
}

function extractProjectFiles(root: string, content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(/(?:^|[\s`"'(])((?:\.?\.?\/)?[\w@./-]+\.(?:md|mdx|ts|tsx|js|mjs|json|html|css|png|jpe?g|gif|svg|pdf|csv|txt|ya?ml))(?:[:\s`"')\],.]|$)/g)) {
    const candidate = match[1];
    if (!candidate) continue;
    const resolved = resolve(root, candidate);
    if (resolved.startsWith(`${root}/`) && existsSync(resolved)) found.add(candidate.replace(/^\.\//, ""));
  }
  return [...found];
}

function addUnique(items: DesktopArtifact[], seen: Set<string>, item: DesktopArtifact): void {
  if (!seen.has(item.id)) { seen.add(item.id); items.push(item); }
}
