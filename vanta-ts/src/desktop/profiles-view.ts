import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { inspectProfileDistribution } from "../profiles/distribution.js";
import { listProfiles, profileBaseHome, readActiveProfileId, type ProfileRecord } from "../profiles/store.js";

export const DEFAULT_PROFILE = "default";
export const SOUL_FILE = "SOUL.md";
export const MAX_SOUL_BYTES = 64 * 1024;

export const ProfileViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  home: z.string(),
  isDefault: z.boolean(),
  isImplicit: z.boolean(),
  status: z.enum(["idle", "queued", "archived"]),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  skillCount: z.number().int().nonnegative(),
  hasSoul: z.boolean(),
  clonedFrom: z.string().nullable(),
});
export type ProfileView = z.infer<typeof ProfileViewSchema>;

async function countSkills(home: string): Promise<number> {
  try { return (await readdir(join(home, "skills"))).filter((name) => !name.startsWith(".")).length; } catch { return 0; }
}

async function fileExists(path: string): Promise<boolean> {
  try { await readFile(path); return true; } catch { return false; }
}

async function viewOf(profile: ProfileRecord, isDefault: boolean): Promise<ProfileView> {
  return {
    id: profile.id, name: profile.name, home: profile.home, isDefault, isImplicit: false, status: profile.status,
    model: profile.model ?? null, provider: profile.provider ?? null,
    skillCount: await countSkills(profile.home), hasSoul: await fileExists(join(profile.home, SOUL_FILE)),
    clonedFrom: profile.clonedFrom ?? null,
  };
}

async function implicitView(env: NodeJS.ProcessEnv, isDefault: boolean): Promise<ProfileView> {
  const home = profileBaseHome(env);
  return {
    id: DEFAULT_PROFILE, name: DEFAULT_PROFILE, home, isDefault, isImplicit: true, status: "idle",
    model: env.VANTA_MODEL ?? null, provider: env.VANTA_PROVIDER ?? null,
    skillCount: await countSkills(home), hasSoul: await fileExists(join(home, SOUL_FILE)), clonedFrom: null,
  };
}

/** The implicit default (base home) plus every non-archived profile; exactly one is the sticky default. */
export async function listProfileViews(env: NodeJS.ProcessEnv): Promise<ProfileView[]> {
  const [records, activeId] = await Promise.all([listProfiles(env), readActiveProfileId(env)]);
  const live = records.filter((profile) => profile.status !== "archived");
  const activeKnown = live.some((profile) => profile.id === activeId);
  const views = await Promise.all(live.map((profile) => viewOf(profile, activeKnown && profile.id === activeId)));
  return [await implicitView(env, !activeKnown), ...views];
}

export async function resolveProfileHome(nameOrId: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const key = nameOrId.trim().toLowerCase();
  if (key === DEFAULT_PROFILE) return profileBaseHome(env);
  const found = (await listProfiles(env)).find((profile) => profile.status !== "archived" && (profile.id === key || profile.name.toLowerCase() === key));
  return found?.home ?? null;
}

export async function readSoul(home: string): Promise<{ content: string; exists: boolean }> {
  try { return { content: await readFile(join(home, SOUL_FILE), "utf8"), exists: true }; } catch { return { content: "", exists: false }; }
}

export async function writeSoul(home: string, content: string): Promise<void> {
  await mkdir(home, { recursive: true });
  await writeFile(join(home, SOUL_FILE), content, "utf8");
}

async function skillNames(home: string): Promise<string[]> {
  try { return (await readdir(join(home, "skills"))).filter((name) => !name.startsWith(".")).sort(); } catch { return []; }
}

/**
 * Writes a shareable distribution directory (vanta-profile.json, SOUL.md, settings.json, skills/) under
 * `<base>/exports/<id>` and validates it with the importer's own secret/history refusal rules.
 */
export async function exportProfileDistribution(profile: ProfileRecord, env: NodeJS.ProcessEnv): Promise<{ path: string; files: string[] }> {
  const out = join(profileBaseHome(env), "exports", profile.id);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const hasSoul = await fileExists(join(profile.home, SOUL_FILE));
  const hasSettings = await fileExists(join(profile.home, "settings.json"));
  const skills = await skillNames(profile.home);
  const manifest = {
    version: 1, name: profile.name,
    profile: { ...(profile.provider ? { provider: profile.provider } : {}), ...(profile.model ? { model: profile.model } : {}), ...(profile.allowedTools ? { allowedTools: profile.allowedTools } : {}) },
    ...(hasSoul ? { soul: SOUL_FILE } : {}), ...(hasSettings ? { settings: "settings.json" } : {}),
    skills: skills.map((name) => `skills/${name}`),
  };
  await writeFile(join(out, "vanta-profile.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (hasSoul) await cp(join(profile.home, SOUL_FILE), join(out, SOUL_FILE));
  if (hasSettings) await cp(join(profile.home, "settings.json"), join(out, "settings.json"));
  if (skills.length) await cp(join(profile.home, "skills"), join(out, "skills"), { recursive: true });
  try {
    const preview = await inspectProfileDistribution(out);
    return { path: out, files: preview.files };
  } catch (error) {
    await rm(out, { recursive: true, force: true });
    throw error;
  }
}
