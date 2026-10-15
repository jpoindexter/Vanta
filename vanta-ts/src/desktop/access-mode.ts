import { readFile } from "node:fs/promises";
import type { PermissionMode } from "../modes/permission-mode.js";
import { resolveOperatingMode, parseOperatingMode } from "../modes/operating-mode.js";
import { loadSettings, localSettingsPath, SettingsSchema, writeSettings } from "../settings/store.js";

export type DesktopAccessMode = "ask" | "approve" | "plan" | "auto" | "full";

export function permissionModeForAccess(mode: DesktopAccessMode): PermissionMode {
  if (mode === "ask" || mode === "plan") return "default";
  if (mode === "auto") return "auto";
  if (mode === "full") return "fullAccess";
  return "acceptEdits";
}

export function accessModeForPermission(mode: PermissionMode): DesktopAccessMode {
  if (mode === "default") return "ask";
  if (mode === "fullAccess") return "full";
  if (mode === "auto") return "auto";
  return "approve";
}

export async function loadDesktopAccessMode(root: string, env: NodeJS.ProcessEnv = process.env): Promise<DesktopAccessMode> {
  const explicit = parseOperatingMode(env.VANTA_DESKTOP_PERMISSION_MODE);
  if (explicit) return explicit === "plan" ? "plan" : accessModeForPermission(explicit);
  const settings = await loadSettings(root, env);
  const resolved = resolveOperatingMode(env);
  return settings.desktop?.accessMode ?? (resolved === "plan" ? "plan" : accessModeForPermission(resolved));
}

export function isDesktopAccessMode(value: unknown): value is DesktopAccessMode {
  return value === "ask" || value === "approve" || value === "plan" || value === "auto" || value === "full";
}

export function desktopAccessModeLabel(mode: DesktopAccessMode): string {
  if (mode === "ask") return "Manual";
  if (mode === "approve") return "Accept edits";
  if (mode === "plan") return "Plan mode";
  if (mode === "auto") return "Auto mode";
  return "Full access";
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
