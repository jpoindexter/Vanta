import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

const ProfileStatusSchema = z.enum(["idle", "queued", "archived"]);
const ProfileSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  status: ProfileStatusSchema,
  home: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  model: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  gatewayIdentity: z.string().min(1),
  clonedFrom: z.string().min(1).optional(),
  lastWork: z.string().min(1).optional(),
  lastWorkAt: z.string().min(1).optional(),
});

const InboxMessageSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  instruction: z.string().min(1),
  status: z.literal("queued"),
  createdAt: z.string().min(1),
});

export type ProfileRecord = z.infer<typeof ProfileSchema> & { active?: boolean };
export type ProfileInboxMessage = z.infer<typeof InboxMessageSchema>;
export type CreateProfileInput = {
  name: string;
  model?: string;
  provider?: string;
  gatewayIdentity?: string;
  clonedFrom?: string;
};

const MANIFEST = "profile.json";
const ACTIVE = "active.json";

export function profileBaseHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.VANTA_PROFILE_BASE_HOME?.trim() || resolveVantaHome(env);
}

function profilesDir(env: NodeJS.ProcessEnv): string {
  return join(profileBaseHome(env), "profiles");
}

export function profileHome(id: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(profilesDir(env), id);
}

function slugify(raw: string): string {
  return raw.toLowerCase().trim()
    .replace(/[^a-z0-9 _-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeLookup(raw: string): string | null {
  if (!raw.trim() || raw.includes("..") || /[\\/]/.test(raw)) return null;
  return slugify(raw);
}

async function readJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

async function readActiveId(env: NodeJS.ProcessEnv): Promise<string | null> {
  const value = await readJson(join(profilesDir(env), ACTIVE));
  return typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string"
    ? (value as { id: string }).id
    : null;
}

async function readProfileDir(dir: string): Promise<ProfileRecord | null> {
  const parsed = ProfileSchema.safeParse(await readJson(join(dir, MANIFEST)));
  return parsed.success ? parsed.data : null;
}

export async function listProfiles(env: NodeJS.ProcessEnv = process.env): Promise<ProfileRecord[]> {
  let names: string[];
  try { names = await readdir(profilesDir(env)); } catch { return []; }
  const [activeId, records] = await Promise.all([
    readActiveId(env),
    Promise.all(names.map((name) => readProfileDir(join(profilesDir(env), name)))),
  ]);
  return records.filter((item): item is ProfileRecord => item !== null)
    .map((item) => item.id === activeId && item.status !== "archived"
      ? { ...item, active: true }
      : item)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function findProfile(nameOrId: string, env: NodeJS.ProcessEnv): Promise<ProfileRecord | null> {
  const key = safeLookup(nameOrId);
  if (!key) return null;
  return (await listProfiles(env)).find((profile) =>
    profile.id === key || profile.name.toLowerCase() === nameOrId.trim().toLowerCase()) ?? null;
}

async function writeProfile(profile: ProfileRecord, env: NodeJS.ProcessEnv): Promise<void> {
  const { active: _active, ...stored } = profile;
  await writeFile(join(profileHome(profile.id, env), MANIFEST), `${JSON.stringify(stored, null, 2)}\n`, "utf8");
}

async function initializeHome(profile: ProfileRecord, env: NodeJS.ProcessEnv): Promise<void> {
  const dirs = ["skills", "memories", "agent-memory", "gateway"];
  await Promise.all(dirs.map((dir) => mkdir(join(profile.home, dir), { recursive: true })));
  const settings = { env: { ...(profile.provider ? { VANTA_PROVIDER: profile.provider } : {}), ...(profile.model ? { VANTA_MODEL: profile.model } : {}) } };
  const identity = { profileId: profile.id, gatewayIdentity: profile.gatewayIdentity };
  await Promise.all([
    writeFile(join(profile.home, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`, "utf8"),
    writeFile(join(profile.home, "identity.json"), `${JSON.stringify(identity, null, 2)}\n`, "utf8"),
    writeFile(join(profile.home, "memories", "profile.md"), "", "utf8"),
    writeProfile(profile, env),
  ]);
}

export async function createProfile(input: CreateProfileInput, env: NodeJS.ProcessEnv = process.env, now = () => new Date()): Promise<ProfileRecord> {
  const name = input.name.trim();
  const id = safeLookup(name);
  if (!id) throw new Error("profile name must contain letters or numbers and no path separators");
  if ((await listProfiles(env)).some((profile) => profile.id === id)) throw new Error(`profile already exists: ${id}`);
  const stamp = now().toISOString();
  const profile: ProfileRecord = {
    version: 1, id, name, status: "idle", home: profileHome(id, env), createdAt: stamp, updatedAt: stamp,
    gatewayIdentity: input.gatewayIdentity?.trim() || id,
    ...(input.model?.trim() ? { model: input.model.trim() } : {}),
    ...(input.provider?.trim() ? { provider: input.provider.trim() } : {}),
    ...(input.clonedFrom ? { clonedFrom: input.clonedFrom } : {}),
  };
  await initializeHome(profile, env);
  return profile;
}

export async function cloneProfile(sourceName: string, name: string, env: NodeJS.ProcessEnv = process.env, now = () => new Date()): Promise<ProfileRecord> {
  const source = await findProfile(sourceName, env);
  if (!source || source.status === "archived") throw new Error(`profile not found: ${sourceName}`);
  return createProfile({ name, model: source.model, provider: source.provider, clonedFrom: source.id }, env, now);
}

export async function switchProfile(nameOrId: string, env: NodeJS.ProcessEnv = process.env, now = () => new Date()): Promise<ProfileRecord> {
  const profile = await findProfile(nameOrId, env);
  if (!profile || profile.status === "archived") throw new Error(`profile not found: ${nameOrId}`);
  await mkdir(profilesDir(env), { recursive: true });
  await writeFile(join(profilesDir(env), ACTIVE), `${JSON.stringify({ id: profile.id, switchedAt: now().toISOString() }, null, 2)}\n`, "utf8");
  return { ...profile, active: true };
}

export async function archiveProfile(nameOrId: string, env: NodeJS.ProcessEnv = process.env, now = () => new Date()): Promise<ProfileRecord> {
  const profile = await findProfile(nameOrId, env);
  if (!profile) throw new Error(`profile not found: ${nameOrId}`);
  const archived = { ...profile, active: undefined, status: "archived" as const, updatedAt: now().toISOString() };
  await writeProfile(archived, env);
  if ((await readActiveId(env)) === profile.id) await rm(join(profilesDir(env), ACTIVE), { force: true });
  return archived;
}

export async function updateProfileDefinition(
  nameOrId: string,
  patch: { model?: string; provider?: string; gatewayIdentity?: string },
  env: NodeJS.ProcessEnv = process.env,
  now = () => new Date(),
): Promise<ProfileRecord> {
  const profile = await findProfile(nameOrId, env);
  if (!profile || profile.status === "archived") throw new Error(`profile not found: ${nameOrId}`);
  const updated: ProfileRecord = {
    ...profile,
    active: undefined,
    updatedAt: now().toISOString(),
    ...(patch.model?.trim() ? { model: patch.model.trim() } : {}),
    ...(patch.provider?.trim() ? { provider: patch.provider.trim() } : {}),
    ...(patch.gatewayIdentity?.trim() ? { gatewayIdentity: patch.gatewayIdentity.trim() } : {}),
  };
  await writeProfile(updated, env);
  await writeFile(join(updated.home, "identity.json"), `${JSON.stringify({ profileId: updated.id, gatewayIdentity: updated.gatewayIdentity }, null, 2)}\n`, "utf8");
  return updated;
}

export async function targetProfile(nameOrId: string, instruction: string, env: NodeJS.ProcessEnv = process.env, now = () => new Date()): Promise<ProfileInboxMessage> {
  const profile = await findProfile(nameOrId, env);
  if (!profile || profile.status === "archived") throw new Error(`profile not found: ${nameOrId}`);
  if (!instruction.trim()) throw new Error("profile instruction is required");
  const stamp = now().toISOString();
  const message: ProfileInboxMessage = { id: randomUUID(), profileId: profile.id, instruction: instruction.trim(), status: "queued", createdAt: stamp };
  await appendFile(join(profile.home, "inbox.jsonl"), `${JSON.stringify(message)}\n`, "utf8");
  await appendFile(join(profile.home, "work.jsonl"), `${JSON.stringify({ ...message, event: "targeted" })}\n`, "utf8");
  await writeProfile({ ...profile, active: undefined, status: "queued", lastWork: message.instruction, lastWorkAt: stamp, updatedAt: stamp }, env);
  return message;
}

export async function listProfileInbox(nameOrId: string, env: NodeJS.ProcessEnv = process.env): Promise<ProfileInboxMessage[]> {
  const profile = await findProfile(nameOrId, env);
  if (!profile) throw new Error(`profile not found: ${nameOrId}`);
  try {
    return (await readFile(join(profile.home, "inbox.jsonl"), "utf8")).split("\n").filter(Boolean)
      .flatMap((line) => { try { const parsed = InboxMessageSchema.safeParse(JSON.parse(line)); return parsed.success ? [parsed.data] : []; } catch { return []; } });
  } catch { return []; }
}

export async function activateProfileEnvironment(env: NodeJS.ProcessEnv = process.env): Promise<ProfileRecord | null> {
  const base = profileBaseHome(env);
  const profile = (await listProfiles({ ...env, VANTA_PROFILE_BASE_HOME: base })).find((item) => item.active);
  if (!profile || profile.status === "archived") return null;
  env.VANTA_PROFILE_BASE_HOME = base;
  env.VANTA_HOME = profile.home;
  env.VANTA_PROFILE = profile.id;
  if (profile.model) env.VANTA_MODEL = profile.model;
  if (profile.provider) env.VANTA_PROVIDER = profile.provider;
  return profile;
}
