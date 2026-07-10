import { createHash } from "node:crypto";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import type { MediaAttachment } from "./platforms/base.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
};

export type CacheInboundMediaResult = {
  path: string;
  bytes: number;
  expiresAt: number;
};

export function mediaCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "media-cache");
}

export function mediaCacheTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const ttl = Number(env.VANTA_MEDIA_CACHE_TTL_MS);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_MS;
}

export function isInsideDir(dir: string, candidate: string): boolean {
  const base = resolve(dir);
  const target = resolve(candidate);
  return target === base || target.startsWith(base.endsWith(sep) ? base : `${base}${sep}`);
}

function extFor(mime: string): string {
  return MIME_EXT[mime.toLowerCase()] ?? "bin";
}

function safeKind(kind: string): string {
  return kind.replace(/[^a-z0-9_-]/gi, "_").toLowerCase() || "media";
}

export async function pruneMediaCache(opts: {
  dir?: string;
  ttlMs?: number;
  now?: number;
} = {}): Promise<number> {
  const dir = opts.dir ?? mediaCacheDir();
  const ttlMs = opts.ttlMs ?? mediaCacheTtlMs();
  const cutoff = (opts.now ?? Date.now()) - ttlMs;
  let removed = 0;
  const names = await readdir(dir).catch(() => []);
  await Promise.all(names.map(async (name) => {
    const path = join(dir, name);
    if (!isInsideDir(dir, path)) return;
    const s = await stat(path).catch(() => null);
    if (!s?.isFile() || s.mtimeMs >= cutoff) return;
    await rm(path, { force: true }).catch(() => {});
    removed += 1;
  }));
  return removed;
}

export async function cacheInboundMedia(
  attachment: MediaAttachment,
  dataBase64: string,
  opts: { env?: NodeJS.ProcessEnv; dir?: string; ttlMs?: number; now?: number } = {},
): Promise<CacheInboundMediaResult> {
  const dir = opts.dir ?? mediaCacheDir(opts.env);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await pruneMediaCache({ dir, ttlMs: opts.ttlMs, now: opts.now });

  const bytes = Buffer.from(dataBase64, "base64");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const path = join(dir, `${safeKind(attachment.kind)}-${hash}.${extFor(attachment.mime)}`);
  if (!isInsideDir(dir, path)) throw new Error("media cache path escaped cache dir");
  await writeFile(path, bytes, { mode: 0o600 });
  return {
    path,
    bytes: bytes.length,
    expiresAt: (opts.now ?? Date.now()) + (opts.ttlMs ?? mediaCacheTtlMs(opts.env)),
  };
}
