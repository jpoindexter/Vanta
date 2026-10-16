import { constants, promises as fsp } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { languageForPath, looksBinary, mimeTypeForPath } from "./media-types";
import { isSecretName, type GuardError, type Guarded, type ProjectGuard } from "./project-guard";

export const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;
export const DATA_URL_MAX_BYTES = 16 * 1024 * 1024;
export const DIR_PAGE_DEFAULT = 2000;
export const DIR_PAGE_MAX = 5000;
const STAT_CONCURRENCY = 16;
const BINARY_SAMPLE_BYTES = 4096;

/** Always-hidden noise, the same set the Vanta tree hid, so a project without a .gitignore stays readable. */
const HIDDEN_ENTRIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".cache",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "dist",
  "node_modules",
  "target",
  "venv"
]);

export interface ReadDirEntry {
  isDirectory: boolean;
  name: string;
  path: string;
}

export interface ReadDirResult {
  entries: ReadDirEntry[];
  error?: string;
  /** Entries in the folder after hiding noise and secrets, before paging. */
  total?: number;
  truncated?: boolean;
}

export const pageSchema = z
  .object({
    limit: z.number().int().min(1).max(DIR_PAGE_MAX).optional(),
    offset: z.number().int().min(0).optional()
  })
  .strict();

export type DirPage = z.infer<typeof pageSchema>;

/** The error code the Vanta tree already renders ("Unable to read (ENOENT)"). */
const TREE_ERROR: Record<GuardError["code"], string> = {
  denied: "denied",
  invalid: "invalid-path",
  missing: "ENOENT",
  "not-dir": "ENOTDIR",
  "not-file": "EISDIR",
  outside: "outside-project",
  unreadable: "EACCES"
};

export const treeError = (error: GuardError): string => TREE_ERROR[error.code];

export interface ReadFileErrorResult {
  error: string;
  message: string;
  ok: false;
  path?: string;
}

export const readFailure = (error: GuardError, target?: unknown): ReadFileErrorResult => ({
  error: TREE_ERROR[error.code],
  message: error.message,
  ok: false,
  ...(typeof target === "string" ? { path: target } : {})
});

async function mapLimited<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index] as T);
    }
  };

  await Promise.all(Array.from({ length: Math.min(STAT_CONCURRENCY, items.length) }, run));

  return results;
}

/** A symlink entry is shown only when it resolves to somewhere readable inside the project. */
async function entryFor(
  dir: string,
  dirent: import("node:fs").Dirent,
  guard: ProjectGuard
): Promise<null | ReadDirEntry> {
  const full = path.join(dir, dirent.name);

  if (dirent.isSymbolicLink() || (!dirent.isDirectory() && !dirent.isFile())) {
    const target = await guard.resolve(full);

    return target.ok ? { isDirectory: target.value.isDirectory, name: dirent.name, path: full } : null;
  }

  return { isDirectory: dirent.isDirectory(), name: dirent.name, path: full };
}

function visibleName(dirent: import("node:fs").Dirent): boolean {
  return !HIDDEN_ENTRIES.has(dirent.name) && !isSecretName(dirent.name, dirent.isDirectory());
}

const dirsFirst = (a: ReadDirEntry, b: ReadDirEntry): number =>
  Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name);

export async function readDir(guard: ProjectGuard, raw: unknown, rawPage?: unknown): Promise<ReadDirResult> {
  const page = pageSchema.safeParse(rawPage ?? {});
  const target = await guard.resolve(raw, "dir");

  if (target.ok === false) {
    return { entries: [], error: treeError(target.error) };
  }

  const offset = page.success ? (page.data.offset ?? 0) : 0;
  const limit = page.success ? (page.data.limit ?? DIR_PAGE_DEFAULT) : DIR_PAGE_DEFAULT;

  try {
    const dirents = (await fsp.readdir(target.value.real, { withFileTypes: true })).filter(visibleName);
    const found = await mapLimited(dirents, dirent => entryFor(target.value.abs, dirent, guard));
    const entries = found.filter((entry): entry is ReadDirEntry => entry !== null).sort(dirsFirst);
    const slice = entries.slice(offset, offset + limit);

    return {
      entries: slice,
      total: entries.length,
      ...(offset + slice.length < entries.length ? { truncated: true } : {})
    };
  } catch (error) {
    return { entries: [], error: (error as NodeJS.ErrnoException).code ?? "read-error" };
  }
}

async function hasGitMarker(dir: string): Promise<boolean> {
  return fsp
    .stat(path.join(dir, ".git"))
    .then(() => true)
    .catch(() => false);
}

const segmentCount = (target: string): number => target.split(path.sep).filter(Boolean).length;

function spelledAbove(start: string, levelsUp: number): string {
  let spelled = start;

  for (let step = 0; step < levelsUp; step += 1) {
    spelled = path.dirname(spelled);
  }

  return spelled;
}

/** The nearest folder at or above `raw` that holds a .git, never climbing past the project root. */
export async function gitRoot(guard: ProjectGuard, raw: unknown): Promise<null | string> {
  const target = await guard.resolve(raw);
  const root = await guard.rootReal();

  if (target.ok === false || !root) {
    return null;
  }

  const { abs, isDirectory, real } = target.value;
  let dir = isDirectory ? real : path.dirname(real);

  for (let levelsUp = 0; dir.startsWith(root); levelsUp += 1) {
    if (await hasGitMarker(dir)) {
      // Answer in the spelling the renderer sent, so its own path comparisons keep matching.
      return segmentCount(abs) === segmentCount(real) ? spelledAbove(isDirectory ? abs : path.dirname(abs), levelsUp) : dir;
    }

    if (dir === root) {
      return null;
    }

    dir = path.dirname(dir);
  }

  return null;
}

async function openRegular(real: string): Promise<Guarded<import("node:fs/promises").FileHandle>> {
  try {
    const handle = await fsp.open(real, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await handle.stat();

    if (!stat.isFile()) {
      await handle.close();

      return { error: { code: "not-file", message: "That path is not a regular file." }, ok: false };
    }

    return { ok: true, value: handle };
  } catch {
    return { error: { code: "unreadable", message: "That file could not be opened." }, ok: false };
  }
}

export interface ReadFileTextResult {
  binary: boolean;
  byteSize: number;
  language: string;
  mimeType: string;
  path: string;
  text: string;
  truncated: boolean;
}

export async function readFileText(guard: ProjectGuard, raw: unknown): Promise<ReadFileErrorResult | ReadFileTextResult> {
  const target = await guard.resolve(raw, "file");

  if (target.ok === false) {
    return readFailure(target.error, raw);
  }

  const opened = await openRegular(target.value.real);

  if (opened.ok === false) {
    return readFailure(opened.error, raw);
  }

  try {
    const byteSize = (await opened.value.stat()).size;
    const buffer = Buffer.alloc(Math.min(byteSize, TEXT_PREVIEW_MAX_BYTES));
    const { bytesRead } = await opened.value.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    const binary = looksBinary(bytes.subarray(0, BINARY_SAMPLE_BYTES));

    return {
      binary,
      byteSize,
      language: languageForPath(target.value.real),
      mimeType: mimeTypeForPath(target.value.real),
      path: target.value.abs,
      text: binary ? "" : bytes.toString("utf8"),
      truncated: byteSize > TEXT_PREVIEW_MAX_BYTES
    };
  } finally {
    await opened.value.close();
  }
}

export async function readFileDataUrl(guard: ProjectGuard, raw: unknown): Promise<ReadFileErrorResult | string> {
  const target = await guard.resolve(raw, "file");

  if (target.ok === false) {
    return readFailure(target.error, raw);
  }

  if (target.value.stat.size > DATA_URL_MAX_BYTES) {
    return {
      error: "EFBIG",
      message: `This file is larger than ${DATA_URL_MAX_BYTES / (1024 * 1024)} MB, so it cannot be previewed.`,
      ok: false,
      path: typeof raw === "string" ? raw : undefined
    };
  }

  const opened = await openRegular(target.value.real);

  if (opened.ok === false) {
    return readFailure(opened.error, raw);
  }

  try {
    const bytes = await opened.value.readFile();

    return `data:${mimeTypeForPath(target.value.real)};base64,${bytes.toString("base64")}`;
  } finally {
    await opened.value.close();
  }
}
