import { readFile } from "node:fs/promises";
import type { PermissionMode } from "../modes/permission-mode.js";
import { parsePermissionMode, resolvePermissionMode } from "../modes/permission-mode.js";
import { loadSettings, localSettingsPath, SettingsSchema, writeSettings } from "../settings/store.js";

export type DesktopAccessMode = "ask" | "approve" | "full";

export function permissionModeForAccess(mode: DesktopAccessMode): PermissionMode {
  if (mode === "ask") return "default";
  if (mode === "full") return "fullAccess";
  return "acceptEdits";
}

export function accessModeForPermission(mode: PermissionMode): DesktopAccessMode {
  if (mode === "default") return "ask";
  if (mode === "fullAccess") return "full";
  return "approve";
}

export async function loadDesktopAccessMode(root: string, env: NodeJS.ProcessEnv = process.env): Promise<DesktopAccessMode> {
  const explicit = parsePermissionMode(env.VANTA_DESKTOP_PERMISSION_MODE);
  if (explicit) return accessModeForPermission(explicit);
  const settings = await loadSettings(root, env);
  return settings.desktop?.accessMode ?? accessModeForPermission(resolvePermissionMode(env));
}

export async function saveDesktopAccessMode(root: string, mode: DesktopAccessMode): Promise<void> {
  const path = localSettingsPath(root);
  const existing = await readLocalSettings(path);
  const parsed = SettingsSchema.safeParse({
    ...existing,
    desktop: { ...(asRecord(existing.desktop)), accessMode: mode },
  });
  if (!parsed.success) throw new Error("desktop access mode could not be saved because local settings are invalid");
  await writeSettings(path, parsed.data);
}

async function readLocalSettings(path: string): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return asRecord(value);
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
