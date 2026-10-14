import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

const FILE = "desktop-settings.json";
export const MIN_RECORDING_SECONDS = 5;
export const MAX_RECORDING_SECONDS = 600;

export function isTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}

/** Device-local preferences the desktop app reads. Strict: an unknown key is dropped on read, refused on write. */
export const DesktopPrefsSchema = z.object({
  /** IANA zone. Applied to the server process (TZ), so the shell tools and timestamps follow it. */
  timezone: z.string().trim().min(1).max(64).refine(isTimezone, "must be an IANA timezone such as Europe/Madrid").optional(),
  /** Show the model's reasoning blocks in the thread. The renderer reads it on load. */
  showReasoning: z.boolean().optional(),
  /** Dictation on or off. The renderer reads it on load. */
  sttEnabled: z.boolean().optional(),
  /** Longest single dictation, in seconds. */
  maxRecordingSeconds: z.number().int().min(MIN_RECORDING_SECONDS).max(MAX_RECORDING_SECONDS).optional(),
}).strict();
export type DesktopPrefs = z.infer<typeof DesktopPrefsSchema>;

export const DEFAULT_PREFS: Required<Pick<DesktopPrefs, "showReasoning" | "sttEnabled" | "maxRecordingSeconds">> = {
  showReasoning: true, sttEnabled: true, maxRecordingSeconds: 120,
};

export const desktopPrefsPath = (env: NodeJS.ProcessEnv = process.env): string => join(resolveVantaHome(env), FILE);

/** Reads the prefs, keeping every valid key; an absent or torn file is an empty set. */
export async function loadDesktopPrefs(env: NodeJS.ProcessEnv = process.env): Promise<DesktopPrefs> {
  let raw: unknown;
  try { raw = JSON.parse(await readFile(desktopPrefsPath(env), "utf8")); } catch { return {}; }
  if (!raw || typeof raw !== "object") return {};
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const one = DesktopPrefsSchema.partial().safeParse({ [key]: value });
    if (one.success) Object.assign(kept, one.data);
  }
  return kept as DesktopPrefs;
}

/** Merges a validated patch into the file with an atomic replace. Returns the stored prefs. */
export async function saveDesktopPrefs(patch: DesktopPrefs, env: NodeJS.ProcessEnv = process.env): Promise<DesktopPrefs> {
  const next = DesktopPrefsSchema.parse({ ...(await loadDesktopPrefs(env)), ...patch });
  const path = desktopPrefsPath(env);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tmp, path);
  return next;
}

/** Points this process at the saved zone so child shells and date formatting agree with the setting. */
export function applyTimezone(prefs: DesktopPrefs, env: NodeJS.ProcessEnv = process.env): void {
  if (prefs.timezone) env.TZ = prefs.timezone;
}
