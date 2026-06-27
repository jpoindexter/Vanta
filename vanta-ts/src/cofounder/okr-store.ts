import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { ObjectiveSchema, type Objective } from "./okr.js";

// COFOUNDER-OKR-STORE — persistence for the OKR model (~/.vanta/okrs.json).
// Split from okr.ts for the size gate: zod at the boundary, a tolerant reader,
// and an injected fs so the round-trip is unit-tested without touching disk.

const StoreSchema = z.object({
  version: z.literal(1).default(1),
  objectives: z.array(z.unknown()).default([]),
});

export type OkrStoreFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: OkrStoreFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  mkdir: async (p) => void (await mkdir(p, { recursive: true })),
};

export function okrsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "okrs.json");
}

/**
 * Read all objectives. Tolerant: a missing file → []; a corrupt file or a
 * malformed entry is dropped (never bricks the read), keeping the valid rows.
 */
export async function readObjectives(
  env: NodeJS.ProcessEnv = process.env,
  fs: OkrStoreFs = realFs,
): Promise<Objective[]> {
  let raw: string;
  try {
    raw = await fs.readFile(okrsPath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof StoreSchema>;
  try {
    parsed = StoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const out: Objective[] = [];
  for (const row of parsed.objectives) {
    const ok = ObjectiveSchema.safeParse(row);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

/** Persist the full objective list, latest-wins. */
export async function writeObjectives(
  list: Objective[],
  env: NodeJS.ProcessEnv = process.env,
  fs: OkrStoreFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(okrsPath(env), `${JSON.stringify({ version: 1, objectives: list }, null, 2)}\n`);
}
