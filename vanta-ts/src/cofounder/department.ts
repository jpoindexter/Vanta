import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { DepartmentSchema, type Department } from "./department-model.js";

// COFOUNDER-DEPARTMENT-UNIT (persistence) — the durable side: the department store
// (~/.vanta/departments.json). The pure department model (schema, CRUD, id
// derivation, status view) lives in department-model.ts and is re-exported here so
// the module's public surface is unchanged. Tolerant reader, injected fs.

export * from "./department-model.js";

// ---- Store (~/.vanta/departments.json, tolerant reader, injected fs) ----

const StoreSchema = z.object({
  version: z.literal(1).default(1),
  departments: z.array(z.unknown()).default([]),
});

export type DeptStoreFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: DeptStoreFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  mkdir: async (p) => void (await mkdir(p, { recursive: true })),
};

export function departmentsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "departments.json");
}

/**
 * Read all departments. Tolerant: a missing file → []; a corrupt file or a
 * malformed entry is dropped (never bricks the read), keeping the valid rows.
 */
export async function readDepartments(
  env: NodeJS.ProcessEnv = process.env,
  fs: DeptStoreFs = realFs,
): Promise<Department[]> {
  let raw: string;
  try {
    raw = await fs.readFile(departmentsPath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof StoreSchema>;
  try {
    parsed = StoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const out: Department[] = [];
  for (const row of parsed.departments) {
    const ok = DepartmentSchema.safeParse(row);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

/** Persist the full department list, latest-wins. */
export async function writeDepartments(
  list: Department[],
  env: NodeJS.ProcessEnv = process.env,
  fs: DeptStoreFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(departmentsPath(env), `${JSON.stringify({ version: 1, departments: list }, null, 2)}\n`);
}
