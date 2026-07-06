import { resolveReadablePath } from "../tools/writable-zones.js";

// MSG-MEDIA-PATH-RECENCY — anti-exfil guard for sending a LOCAL file out over a
// channel. A path must be (1) in an allowed root/zone and not a protected
// credential path (reuses resolveReadablePath — the same scope policy read_file
// uses), AND (2) RECENTLY PRODUCED. The recency bound is the new idea: even an
// in-scope file can't be exfiltrated if the agent was tricked into naming an
// arbitrary OLD file — a legitimate send is of something Vanta just made (a
// screenshot, a chart, a generated report), so its mtime is fresh. Pure over an
// injected stat; the caller still routes the eventual read through the kernel.

const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000; // 1h — a just-produced artifact

/** Resolve the recency window from VANTA_MEDIA_MAX_AGE_SEC (default 3600s). */
export function mediaMaxAgeMs(env: NodeJS.ProcessEnv): number {
  const n = Number(env.VANTA_MEDIA_MAX_AGE_SEC);
  return Number.isFinite(n) && n > 0 ? n * 1000 : DEFAULT_MAX_AGE_MS;
}

/** Injected file-stat seam (real fs.stat in production, a fake in tests). */
export type StatMtime = (absPath: string) => Promise<number | null>;

export type MediaSendVerdict = { ok: true; abs: string } | { ok: false; error: string };

export type MediaGuardOpts = {
  root: string;
  env: NodeJS.ProcessEnv;
  now: number;
  stat: StatMtime;
  maxAgeMs?: number;
};

/**
 * Validate a local file may be SENT out: in-scope (via resolveReadablePath, so
 * protected/credential + out-of-zone paths are refused with its message) AND
 * produced within the recency window. Errors-as-values; never throws. The
 * recency check runs only AFTER the scope check passes (no stat on a path we'd
 * refuse anyway, and the error names the right reason first).
 */
export async function validateMediaSend(rawPath: string, opts: MediaGuardOpts): Promise<MediaSendVerdict> {
  const scoped = resolveReadablePath(rawPath, opts.root, opts.env);
  if (!scoped.ok) return { ok: false, error: scoped.error };

  const mtime = await opts.stat(scoped.abs);
  if (mtime === null) return { ok: false, error: `refused: ${rawPath} does not exist or is unreadable` };

  const maxAge = opts.maxAgeMs ?? mediaMaxAgeMs(opts.env);
  const age = opts.now - mtime;
  if (age > maxAge) {
    const mins = Math.round(age / 60_000);
    return {
      ok: false,
      error: `refused: ${rawPath} was last modified ~${mins}m ago — a file send must be a recently-produced artifact (anti-exfil; window ${Math.round(maxAge / 60_000)}m). Regenerate it, or raise VANTA_MEDIA_MAX_AGE_SEC.`,
    };
  }
  return { ok: true, abs: scoped.abs };
}

/** Live stat adapter: mtime in epoch ms, or null when the path can't be stat'd. */
export const fsStatMtime: StatMtime = async (absPath) => {
  try {
    const { stat } = await import("node:fs/promises");
    return (await stat(absPath)).mtimeMs;
  } catch {
    return null;
  }
};
