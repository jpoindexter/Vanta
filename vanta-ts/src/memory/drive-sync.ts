// MEMORY-ADAPTER-DRIVE — Google Drive memory backup/sync, behind a small
// memory-adapter port so other backends (S3, git remote, …) can follow.
//
// This module is PURE + INJECTABLE: the sync-plan computation and the executed
// runner take their data and their I/O through arguments, so they unit-test
// with no real Drive and no real fs. The live Drive list/upload/download is the
// documented boundary — a `DriveMemoryAdapter` (impl of `MemoryAdapter` over
// `tools/drive.ts` + the existing google OAuth in `google/client.ts`) and a
// `vanta memory sync drive` command would be the only new live code; both would
// call `buildMemorySyncPlan` then `runMemorySync` here. Mirrors the clarity-gate
// shape: decide first (pure plan), then act (injected runner).
//
// SECURITY: memory files may contain personal data, so the adapter is
// OPERATOR-INITIATED (a sync command), never automatic, and a CONFLICT is never
// silently overwritten — both sides changed, so the operator decides. The OAuth
// is the EXISTING google one (`getAccessToken` via `googleFetch`); no new auth.

/** A local memory file: name + a content hash + last-modified epoch ms. */
export type MemoryFile = {
  name: string;
  hash: string;
  modifiedMs: number;
};

/**
 * A remote (Drive) memory file. `hash` is optional — a backend may not expose a
 * content hash, in which case same-name files are compared by mtime only (and a
 * present-but-different hash drives the conflict/newer-wins logic below).
 */
export type RemoteFile = {
  name: string;
  hash?: string;
  modifiedMs: number;
};

/** The computed sync plan: which files to push, pull, flag as conflicts, skip. */
export type MemorySyncPlan = {
  toPush: string[];
  toPull: string[];
  conflicts: string[];
  upToDate: string[];
};

/**
 * Compute the sync plan from the local + remote file lists (PURE).
 *
 * Per name:
 * - only local        → push  (new local file; first-backup empty-remote ⇒ push-all)
 * - only remote       → pull  (file Vanta doesn't have locally)
 * - both, same hash   → upToDate (identical content, nothing to do)
 * - both, diff hash   → newer mtime wins: local newer ⇒ push, remote newer ⇒ pull
 * - both, diff hash, equal mtime → conflict (can't tell which is canonical;
 *   without a shared base both may have diverged — operator decides, never auto)
 *
 * A remote file with no hash is treated as "different" from a local file unless
 * the hashes are both present and equal, so the mtime-newer-wins / equal-mtime
 * conflict rule still applies (a remote with no hash + equal mtime ⇒ conflict).
 */
export function buildMemorySyncPlan(
  local: readonly MemoryFile[],
  remote: readonly RemoteFile[],
): MemorySyncPlan {
  const remoteByName = new Map(remote.map((r) => [r.name, r] as const));
  const localNames = new Set(local.map((l) => l.name));
  const plan: MemorySyncPlan = { toPush: [], toPull: [], conflicts: [], upToDate: [] };

  for (const l of local) {
    const r = remoteByName.get(l.name);
    if (!r) {
      plan.toPush.push(l.name); // only local → push (incl. first backup)
      continue;
    }
    classifyBoth(l, r, plan);
  }

  for (const r of remote) {
    if (!localNames.has(r.name)) plan.toPull.push(r.name); // only remote → pull
  }

  return plan;
}

/** Classify a name present on BOTH sides into the right plan bucket. */
function classifyBoth(local: MemoryFile, remote: RemoteFile, plan: MemorySyncPlan): void {
  if (remote.hash !== undefined && remote.hash === local.hash) {
    plan.upToDate.push(local.name); // identical content
    return;
  }
  // Different content. Newer modifiedMs wins; equal mtime + different content is
  // an unresolvable conflict (both may have diverged from a shared base).
  if (local.modifiedMs > remote.modifiedMs) plan.toPush.push(local.name);
  else if (remote.modifiedMs > local.modifiedMs) plan.toPull.push(local.name);
  else plan.conflicts.push(local.name);
}

/** One-line human summary of a plan: "N push · M pull · K conflicts · J up-to-date". */
export function formatSyncPlan(plan: MemorySyncPlan): string {
  return (
    `${plan.toPush.length} push · ${plan.toPull.length} pull · ` +
    `${plan.conflicts.length} conflicts · ${plan.upToDate.length} up-to-date`
  );
}

/**
 * The memory-adapter PORT. A backend (Drive, S3, git remote, …) implements this;
 * `runMemorySync` depends only on the port, so the live Drive API stays a
 * boundary. The first concrete impl is the named-but-not-built `DriveMemoryAdapter`
 * (over `tools/drive.ts` + the existing google OAuth).
 */
export type MemoryAdapter = {
  /** List the remote memory files (name + mtime, hash when the backend exposes one). */
  list(): Promise<RemoteFile[]>;
  /** Upload `content` to the remote file `name` (create or overwrite remote). */
  push(name: string, content: string): Promise<void>;
  /** Download the remote file `name`'s content. */
  pull(name: string): Promise<string>;
};

/** Reader for a local memory file's current content, injected (no real fs here). */
export type ReadLocal = (name: string) => Promise<string>;

/** The executed result of a sync: which names were actually pushed/pulled, and the conflicts left for the operator. */
export type MemorySyncResult = {
  pushed: string[];
  pulled: string[];
  conflicts: string[];
};

/**
 * Execute a sync: build the plan from `local` + the adapter's remote listing,
 * push the toPush files (via `readLocal` → `adapter.push`), pull the toPull files
 * (via `adapter.pull`), and SKIP conflicts (report them, never auto-overwrite).
 *
 * Best-effort per file: a single file's adapter/read error is RECORDED (the name
 * is simply not added to pushed/pulled), never thrown — the rest of the sync
 * proceeds. Errors-as-values: the whole call resolves to the counts, it does not
 * reject. Conflicts are returned verbatim so the operator can resolve them.
 */
export async function runMemorySync(
  local: readonly MemoryFile[],
  adapter: MemoryAdapter,
  readLocal: ReadLocal,
): Promise<MemorySyncResult> {
  const remote = await safeList(adapter);
  const plan = buildMemorySyncPlan(local, remote);
  const result: MemorySyncResult = { pushed: [], pulled: [], conflicts: plan.conflicts };

  for (const name of plan.toPush) {
    if (await tryPush(name, adapter, readLocal)) result.pushed.push(name);
  }
  for (const name of plan.toPull) {
    if (await tryPull(name, adapter)) result.pulled.push(name);
  }

  return result;
}

/** List remote files, treating a listing failure as an empty remote (first-backup behavior). */
async function safeList(adapter: MemoryAdapter): Promise<RemoteFile[]> {
  try {
    return await adapter.list();
  } catch {
    return [];
  }
}

/** Push one file; swallow a per-file error so the batch continues. Returns success. */
async function tryPush(name: string, adapter: MemoryAdapter, readLocal: ReadLocal): Promise<boolean> {
  try {
    await adapter.push(name, await readLocal(name));
    return true;
  } catch {
    return false;
  }
}

/** Pull one file; swallow a per-file error so the batch continues. Returns success. */
async function tryPull(name: string, adapter: MemoryAdapter): Promise<boolean> {
  try {
    await adapter.pull(name);
    return true;
  } catch {
    return false;
  }
}
