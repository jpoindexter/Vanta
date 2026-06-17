import { resolveMemoryStore } from "../store/memory-store.js";

export type UmbrellaEntry = {
  name: string;
  pins: string[];
};

/** Home-relative path to the umbrella registry. */
const UMBRELLA_PATH = "skills/umbrellas.json";

/**
 * Read all umbrella entries from disk. Returns [] if the file is missing or
 * unparseable — never throws on absent data.
 */
export async function readUmbrellas(
  env: NodeJS.ProcessEnv = process.env,
): Promise<UmbrellaEntry[]> {
  const raw = await resolveMemoryStore(env).read(UMBRELLA_PATH);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as UmbrellaEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Write the umbrella list to disk, creating the skills dir if it doesn't exist.
 */
export async function writeUmbrellas(
  umbrellas: UmbrellaEntry[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await resolveMemoryStore(env).write(UMBRELLA_PATH, JSON.stringify(umbrellas, null, 2));
}

/**
 * Add `skillSlug` to the umbrella named `umbrellaName`, creating the umbrella
 * if it doesn't exist. Deduplicates — pinning the same slug twice is a no-op.
 */
export async function pinSkill(
  umbrellaName: string,
  skillSlug: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const umbrellas = await readUmbrellas(env);
  const existing = umbrellas.find((u) => u.name === umbrellaName);
  if (existing) {
    if (!existing.pins.includes(skillSlug)) {
      existing.pins.push(skillSlug);
    }
  } else {
    umbrellas.push({ name: umbrellaName, pins: [skillSlug] });
  }
  await writeUmbrellas(umbrellas, env);
}

/**
 * Remove `skillSlug` from the umbrella named `umbrellaName`. If the umbrella
 * becomes empty after removal it is deleted entirely.
 */
export async function unpinSkill(
  umbrellaName: string,
  skillSlug: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const umbrellas = await readUmbrellas(env);
  const updated = umbrellas
    .map((u) =>
      u.name === umbrellaName
        ? { ...u, pins: u.pins.filter((p) => p !== skillSlug) }
        : u,
    )
    .filter((u) => u.pins.length > 0);
  await writeUmbrellas(updated, env);
}

/**
 * Pure: return the pin list for the umbrella named `name`, or [] if not found.
 */
export function resolveUmbrella(
  name: string,
  umbrellas: UmbrellaEntry[],
): string[] {
  return umbrellas.find((u) => u.name === name)?.pins ?? [];
}
