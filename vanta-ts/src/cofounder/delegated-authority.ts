import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { AuthorityGrantSchema, type AuthorityGrant, type DelegatedAuditRecord } from "./authority-model.js";

// COFOUNDER-DELEGATED-AUTHORITY (persistence) — the durable side: the grant store
// (~/.vanta/authority-grants.json) and the append-only audit log
// (~/.vanta/authority-audit.jsonl). The pure grant model, bound-check, and
// audit-record builders live in authority-model.ts and are re-exported here so the
// module's public surface is unchanged.

export * from "./authority-model.js";

// ---- Store (~/.vanta/authority-grants.json + append-only audit log, injected fs) ----

export type AuthorityFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  appendFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: AuthorityFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  appendFile: (p, d) => appendFile(p, d, "utf8"),
  mkdir: async (p) => void (await mkdir(p, { recursive: true })),
};

const StoreSchema = z.object({
  version: z.literal(1).default(1),
  grants: z.array(z.unknown()).default([]),
});

export function grantsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "authority-grants.json");
}

export function auditLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "authority-audit.jsonl");
}

/**
 * Read all grants. Tolerant: a missing file → []; a corrupt file or malformed
 * entry is dropped (never bricks the read), keeping the valid rows.
 */
export async function readGrants(
  env: NodeJS.ProcessEnv = process.env,
  fs: AuthorityFs = realFs,
): Promise<AuthorityGrant[]> {
  let raw: string;
  try {
    raw = await fs.readFile(grantsPath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof StoreSchema>;
  try {
    parsed = StoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const out: AuthorityGrant[] = [];
  for (const row of parsed.grants) {
    const ok = AuthorityGrantSchema.safeParse(row);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

/** Persist the full grant list, latest-wins. */
export async function writeGrants(
  list: AuthorityGrant[],
  env: NodeJS.ProcessEnv = process.env,
  fs: AuthorityFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(grantsPath(env), `${JSON.stringify({ version: 1, grants: list }, null, 2)}\n`);
}

/** Append one decision to the append-only audit log (one JSON object per line). */
export async function appendAuditRecord(
  record: DelegatedAuditRecord,
  env: NodeJS.ProcessEnv = process.env,
  fs: AuthorityFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.appendFile(auditLogPath(env), `${JSON.stringify(record)}\n`);
}

/** Read the audit log, tolerant of malformed lines (dropped). */
export async function readAuditLog(
  env: NodeJS.ProcessEnv = process.env,
  fs: AuthorityFs = realFs,
): Promise<DelegatedAuditRecord[]> {
  let raw: string;
  try {
    raw = await fs.readFile(auditLogPath(env));
  } catch {
    return [];
  }
  const out: DelegatedAuditRecord[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as DelegatedAuditRecord);
    } catch {
      // drop a malformed line, keep the rest
    }
  }
  return out;
}
