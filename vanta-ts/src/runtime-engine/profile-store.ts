import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  RuntimeProfileV2Schema,
  createRuntimeProfile,
  migrateRuntimeProfile,
  validateRuntimeProfile,
  type CreateRuntimeProfileInput,
  type RuntimeProfile,
} from "./profile-contract.js";

const PROFILE_DIR = ".vanta/runtime-profiles";
const SELECTED = "selected.json";

function profilesDir(root: string): string { return join(root, PROFILE_DIR); }
function profilePath(root: string, id: string): string { return join(profilesDir(root), `${id}.json`); }

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function readJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return null; }
}

function importable(input: unknown): RuntimeProfile {
  let profile: RuntimeProfile;
  try { profile = migrateRuntimeProfile(input); }
  catch (error) { throw new Error(`Fix the profile fields, then import again: ${error instanceof Error ? error.message : String(error)}`); }
  const validation = validateRuntimeProfile(profile, {
    platform: profile.compatibility.platforms[0] ?? "unknown",
    architecture: profile.compatibility.architectures[0] ?? "unknown",
    memoryBytes: profile.resources.availableMemoryBytes,
  });
  if (!validation.valid) {
    const first = validation.issues[0];
    throw new Error(`Fix the profile fields, then import again: ${first?.message ?? "invalid profile"} ${first?.recovery ?? ""}`.trim());
  }
  return profile;
}

async function writeProfile(root: string, profile: RuntimeProfile, replace = false): Promise<void> {
  if (!replace && await readJson(profilePath(root, profile.id))) throw new Error(`runtime profile already exists: ${profile.id}`);
  await atomicJson(profilePath(root, profile.id), RuntimeProfileV2Schema.parse(profile));
}

export async function listRuntimeProfiles(root: string): Promise<RuntimeProfile[]> {
  let names: string[];
  try { names = (await readdir(profilesDir(root))).filter((name) => name.endsWith(".json") && name !== SELECTED); }
  catch { return []; }
  const values = await Promise.all(names.map((name) => readJson(join(profilesDir(root), name))));
  return values.flatMap((value) => {
    try { return [migrateRuntimeProfile(value)]; } catch { return []; }
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function readRuntimeProfile(root: string, id: string): Promise<RuntimeProfile> {
  const value = await readJson(profilePath(root, id));
  if (!value) throw new Error(`runtime profile not found: ${id}`);
  try { return migrateRuntimeProfile(value); }
  catch (error) { throw new Error(`runtime profile ${id} is invalid. Fix the profile fields or import a clean copy: ${error instanceof Error ? error.message : String(error)}`); }
}

export async function createStoredRuntimeProfile(
  root: string,
  input: CreateRuntimeProfileInput | RuntimeProfile,
  now = () => new Date(),
): Promise<RuntimeProfile> {
  const current = RuntimeProfileV2Schema.safeParse(input);
  const profile = current.success ? current.data : createRuntimeProfile(input as CreateRuntimeProfileInput, now);
  await writeProfile(root, importable(profile));
  return profile;
}

export async function cloneRuntimeProfile(root: string, input: { sourceId: string; id: string; name: string }, now = () => new Date()): Promise<RuntimeProfile> {
  const source = await readRuntimeProfile(root, input.sourceId);
  const stamp = now().toISOString();
  const clone = RuntimeProfileV2Schema.parse({ ...source, id: input.id, name: input.name, clonedFrom: source.id, createdAt: stamp, updatedAt: stamp });
  await writeProfile(root, clone);
  return clone;
}

export async function selectRuntimeProfile(root: string, id: string, now = () => new Date()): Promise<RuntimeProfile> {
  const profile = await readRuntimeProfile(root, id);
  await atomicJson(join(profilesDir(root), SELECTED), { version: 1, id: profile.id, selectedAt: now().toISOString() });
  return profile;
}

export async function readSelectedRuntimeProfile(root: string): Promise<RuntimeProfile | null> {
  const selected = await readJson(join(profilesDir(root), SELECTED));
  const id = typeof selected === "object" && selected !== null && typeof (selected as { id?: unknown }).id === "string" ? (selected as { id: string }).id : null;
  return id ? readRuntimeProfile(root, id).catch(() => null) : null;
}

export async function exportRuntimeProfile(root: string, id: string): Promise<string> {
  return `${JSON.stringify(await readRuntimeProfile(root, id), null, 2)}\n`;
}

export async function importRuntimeProfile(root: string, input: unknown, replace = false): Promise<RuntimeProfile> {
  const profile = importable(input);
  await writeProfile(root, profile, replace);
  return profile;
}

export async function linkRuntimeProfileModel(
  root: string,
  id: string,
  modelPath: string,
  modelBytes: number,
  now = () => new Date(),
): Promise<RuntimeProfile> {
  const profile = await readRuntimeProfile(root, id);
  const linked = RuntimeProfileV2Schema.parse({
    ...profile,
    model: { path: modelPath, bytes: modelBytes },
    updatedAt: now().toISOString(),
  });
  await writeProfile(root, linked, true);
  return linked;
}
