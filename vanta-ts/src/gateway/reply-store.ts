import { join } from "node:path";
import { z } from "zod";

// MSG-REPLY-CONTEXT — a bounded `messageId → text` store written at SEND time.
// On an inbound message carrying a `reply_to_id`, the quoted bot text is looked
// up here and injected as quote context. Atomic write (temp + rename) so a crash
// mid-write never leaves a torn file; capped so it can't grow unbounded. fs/path
// are injected so the store is unit-testable with no real filesystem.

export const DEFAULT_REPLY_STORE_CAP = 200;
const STORE_VERSION = 1 as const;

const ReplyEntrySchema = z.object({ id: z.string().min(1), text: z.string() });
const ReplyStoreSchema = z.object({
  version: z.literal(STORE_VERSION),
  // Insertion-ordered: oldest first, newest last. The cap drops from the front.
  entries: z.array(ReplyEntrySchema),
});
export type ReplyStoreFile = z.infer<typeof ReplyStoreSchema>;

/** Injected filesystem surface — the real adapter is `nodeReplyFs`. */
export type ReplyFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
};

export type ReplyStoreDeps = {
  fs: ReplyFs;
  /** Directory holding the store file (the kernel data dir, `.vanta/`). */
  dir: string;
  /** Max retained entries; older ones are evicted first. */
  cap?: number;
};

export function replyStorePath(dir: string): string {
  return join(dir, "reply-context.json");
}

/** Read the store, tolerantly — a missing/corrupt file yields an empty store. */
export async function readReplyStore(deps: ReplyStoreDeps): Promise<ReplyStoreFile> {
  let raw: string;
  try {
    raw = await deps.fs.readFile(replyStorePath(deps.dir));
  } catch {
    return { version: STORE_VERSION, entries: [] };
  }
  try {
    const parsed = ReplyStoreSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { version: STORE_VERSION, entries: [] };
  } catch {
    return { version: STORE_VERSION, entries: [] };
  }
}

/**
 * Pure: upsert an `id → text` entry into a store, keeping insertion order and
 * enforcing the cap (drop oldest). Re-recording an id moves it to newest.
 */
export function withRecorded(
  store: ReplyStoreFile,
  id: string,
  text: string,
  cap: number,
): ReplyStoreFile {
  const kept = store.entries.filter((e) => e.id !== id);
  kept.push({ id, text });
  const overflow = kept.length - Math.max(1, cap);
  const entries = overflow > 0 ? kept.slice(overflow) : kept;
  return { version: STORE_VERSION, entries };
}

/**
 * Record a sent message's `id → text` atomically. Best-effort: any failure is
 * swallowed so a store write never breaks the send path. A blank id is ignored.
 */
export async function recordSent(deps: ReplyStoreDeps, id: string, text: string): Promise<void> {
  if (!id) return;
  try {
    const store = await readReplyStore(deps);
    const next = withRecorded(store, id, text, deps.cap ?? DEFAULT_REPLY_STORE_CAP);
    const path = replyStorePath(deps.dir);
    const tmp = `${path}.${process.pid}.tmp`;
    await deps.fs.writeFile(tmp, `${JSON.stringify(next)}\n`);
    await deps.fs.rename(tmp, path);
  } catch {
    // best-effort — losing a reply-context row degrades to a no-op lookup later
  }
}

/** Look up the text of a previously-sent message. Miss → null (degrade, never throw). */
export async function lookupSent(deps: ReplyStoreDeps, id: string): Promise<string | null> {
  if (!id) return null;
  try {
    const store = await readReplyStore(deps);
    return store.entries.find((e) => e.id === id)?.text ?? null;
  } catch {
    return null;
  }
}

/** The real Node fs adapter for production use. */
export function nodeReplyFs(): ReplyFs {
  return {
    readFile: (path) => import("node:fs/promises").then((m) => m.readFile(path, "utf8")),
    writeFile: (path, data) => import("node:fs/promises").then((m) => m.writeFile(path, data, "utf8")),
    rename: (from, to) => import("node:fs/promises").then((m) => m.rename(from, to)),
  };
}
