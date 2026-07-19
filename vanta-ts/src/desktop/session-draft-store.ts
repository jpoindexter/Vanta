import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

const DraftRecordSchema = z.object({
  root: z.string(),
  sessionId: z.string(),
  value: z.string(),
  updatedAt: z.string(),
});
const DraftStoreSchema = z.object({
  version: z.literal(1),
  drafts: z.record(z.string(), DraftRecordSchema),
});

type DraftStore = z.infer<typeof DraftStoreSchema>;

function storePath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "desktop-session-drafts.json");
}

function draftKey(root: string, sessionId: string): string {
  return createHash("sha256").update(`${root}\0${sessionId}`).digest("hex");
}

async function loadStore(env: NodeJS.ProcessEnv): Promise<DraftStore> {
  try {
    const parsed = DraftStoreSchema.safeParse(JSON.parse(await readFile(storePath(env), "utf8")));
    return parsed.success ? parsed.data : { version: 1, drafts: {} };
  } catch {
    return { version: 1, drafts: {} };
  }
}

async function saveStore(store: DraftStore, env: NodeJS.ProcessEnv): Promise<void> {
  const path = storePath(env);
  const temporary = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(temporary, `${JSON.stringify(store)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

export async function loadDesktopSessionDraft(
  root: string,
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ exists: boolean; value: string }> {
  const record = (await loadStore(env)).drafts[draftKey(root, sessionId)];
  return record ? { exists: true, value: record.value } : { exists: false, value: "" };
}

export async function saveDesktopSessionDraft(
  root: string,
  sessionId: string,
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const store = await loadStore(env);
  const key = draftKey(root, sessionId);
  if (value) store.drafts[key] = { root, sessionId, value, updatedAt: new Date().toISOString() };
  else delete store.drafts[key];
  await saveStore(store, env);
}
