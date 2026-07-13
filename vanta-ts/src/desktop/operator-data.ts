import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readCanvasArtifact } from "../canvas/artifact.js";
import { MESSAGING_CATALOG, messagingPlatformById, platformAvailability } from "../gateway/platforms/registry.js";
import { upsertEnvMigratingLegacy } from "../setup.js";
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
  configured: boolean;
  missing: string[];
  prerequisite?: string;
  warning?: string;
  setupSteps: string[];
  signupUrl?: string;
  fields: { key: string; label: string; secret: boolean }[];
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
      configured: availability.configured,
      missing: availability.missing,
      prerequisite: platform.prerequisite,
      warning: platform.warning,
      setupSteps: platform.setupSteps,
      signupUrl: platform.signupUrl,
      fields: platform.requiredEnv.map((key) => ({ key, label: labelForEnv(key), secret: key === platform.secretEnv })),
    };
  });
}

export async function saveDesktopMessagingPlatform(root: string, id: string, values: unknown): Promise<DesktopMessagingPlatform> {
  const platform = messagingPlatformById(id);
  if (!platform?.implemented) throw new Error("Messaging platform is not available.");
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Credential values are required.");
  const supplied = values as Record<string, unknown>;
  const updates: Record<string, string> = { ...(platform.enableEnv ?? {}) };
  for (const key of platform.requiredEnv) {
    const value = supplied[key];
    if (typeof value !== "string" || !value.trim()) throw new Error(`${labelForEnv(key)} is required.`);
    if (value.length > 16_000) throw new Error(`${labelForEnv(key)} is too long.`);
    updates[key] = value.trim();
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
