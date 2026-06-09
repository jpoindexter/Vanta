import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// CCR (Compress-Cache-Retrieve), native. Compression is lossy by design; this
// makes it lossless-on-demand. The original tool output is stashed under a short
// content hash in `.vanta/ccr/`; the agent gets a retrieval id and can call the
// `retrieve_original` tool to read the full text back. No DB — flat files.

const CCR_DIR = "ccr";
const ID_LEN = 10;

function ccrDir(dataDir: string): string {
  return join(dataDir, CCR_DIR);
}

/** Short, stable content id (sha256 prefix). Pure. */
export function ccrId(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, ID_LEN);
}

/**
 * Stash the original text under its content id. Idempotent (same content → same
 * id → same file). Returns the id. Best-effort: a write failure is non-fatal,
 * the caller still has the compressed text.
 */
export async function stashOriginal(dataDir: string, text: string): Promise<string> {
  const id = ccrId(text);
  const dir = ccrDir(dataDir);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.txt`);
  if (!existsSync(path)) await writeFile(path, text, "utf-8");
  return id;
}

/** Retrieve a stashed original by id, or null if unknown. */
export async function retrieveOriginal(dataDir: string, id: string): Promise<string | null> {
  if (!/^[a-f0-9]{1,64}$/.test(id)) return null; // guard: ids are hex only
  const path = join(ccrDir(dataDir), `${id}.txt`);
  if (!existsSync(path)) return null;
  return readFile(path, "utf-8");
}
