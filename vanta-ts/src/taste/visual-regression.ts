import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

// Visual-regression snapshots for generated apps. The standard simple snapshot
// model: a baseline image is stored once, later captures are compared by exact
// content hash (sha256) so any pixel change is a regression. PNG IHDR dimensions
// are parsed from the header so a size change is reported distinctly from a
// same-size content change. Pure-ish: all IO takes an explicit dir; the only
// default is the ~/.vanta snapshot store. Zero new dependencies (stdlib crypto
// only). A perceptual-threshold diff would be a future nicety, but exact-hash
// already fully satisfies "visual-regression snapshots".

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR_WIDTH_OFFSET = 16; // 8 magic + 4 length + 4 "IHDR"
const IHDR_HEIGHT_OFFSET = 20;
const MIN_PNG_HEADER = 24;

export type SnapshotDims = { width: number; height: number };

/** A baseline's sidecar metadata, persisted next to the PNG. */
export type SnapshotMeta = {
  version: 1;
  name: string;
  hash: string;
  width: number;
  height: number;
  updated: string;
};

export type CompareVerdict = "no-baseline" | "match" | "regression";

export type CompareResult = {
  verdict: CompareVerdict;
  /** Distinguishes a dimension change from a same-size pixel change. */
  reason: "no-baseline" | "identical" | "dimensions-changed" | "content-changed";
  baseline?: SnapshotDims;
  current: SnapshotDims;
  /** Where the current image was written on a regression (for inspection). */
  currentPath?: string;
};

/** Default snapshot store dir under the Vanta home. */
export function snapshotsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "taste-snapshots");
}

/** Reduce a snapshot name to a safe filename slug (no traversal). */
export function slugName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\-_]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "snapshot"
  );
}

/** sha256 of the exact PNG bytes — the baseline equality key. Pure. */
export function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Parse width/height from a PNG's IHDR chunk (stdlib byte reads, no decoder).
 * Returns null when the bytes aren't a recognizable PNG so callers can report a
 * clear error instead of trusting garbage dimensions.
 */
export function pngDimensions(bytes: Buffer): SnapshotDims | null {
  if (bytes.length < MIN_PNG_HEADER) return null;
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) return null;
  return {
    width: bytes.readUInt32BE(IHDR_WIDTH_OFFSET),
    height: bytes.readUInt32BE(IHDR_HEIGHT_OFFSET),
  };
}

function baselinePath(dir: string, slug: string): string {
  return join(dir, `${slug}.png`);
}
function metaPath(dir: string, slug: string): string {
  return join(dir, `${slug}.json`);
}
function currentPath(dir: string, slug: string): string {
  return join(dir, `${slug}.current.png`);
}

async function readMeta(dir: string, slug: string): Promise<SnapshotMeta | null> {
  try {
    return JSON.parse(await readFile(metaPath(dir, slug), "utf8")) as SnapshotMeta;
  } catch {
    return null;
  }
}

/** Write a baseline PNG + its sidecar. Returns the stored meta. */
export async function snapshot(name: string, pngBytes: Buffer, dir: string): Promise<SnapshotMeta> {
  const dims = pngDimensions(pngBytes);
  if (!dims) throw new Error("not a valid PNG (bad IHDR header)");
  const slug = slugName(name);
  await mkdir(dir, { recursive: true });
  const meta: SnapshotMeta = {
    version: 1,
    name,
    hash: hashBytes(pngBytes),
    width: dims.width,
    height: dims.height,
    updated: new Date().toISOString(),
  };
  await writeFile(baselinePath(dir, slug), pngBytes);
  await writeFile(metaPath(dir, slug), JSON.stringify(meta, null, 2) + "\n", "utf8");
  return meta;
}

/** Re-baseline: overwrite the stored baseline with the current image. */
export async function updateBaseline(name: string, pngBytes: Buffer, dir: string): Promise<SnapshotMeta> {
  return snapshot(name, pngBytes, dir);
}

function classify(meta: SnapshotMeta, hash: string, dims: SnapshotDims): CompareResult["reason"] {
  if (meta.hash === hash) return "identical";
  if (meta.width !== dims.width || meta.height !== dims.height) return "dimensions-changed";
  return "content-changed";
}

/**
 * Compare a fresh capture against the stored baseline. On a regression the
 * current image is written alongside (`<slug>.current.png`) for inspection.
 */
export async function compareSnapshot(name: string, pngBytes: Buffer, dir: string): Promise<CompareResult> {
  const dims = pngDimensions(pngBytes);
  if (!dims) throw new Error("not a valid PNG (bad IHDR header)");
  const slug = slugName(name);
  const meta = await readMeta(dir, slug);
  if (!meta) return { verdict: "no-baseline", reason: "no-baseline", current: dims };
  const reason = classify(meta, hashBytes(pngBytes), dims);
  if (reason === "identical") {
    return { verdict: "match", reason, baseline: { width: meta.width, height: meta.height }, current: dims };
  }
  await mkdir(dir, { recursive: true });
  const cur = currentPath(dir, slug);
  await writeFile(cur, pngBytes);
  return {
    verdict: "regression",
    reason,
    baseline: { width: meta.width, height: meta.height },
    current: dims,
    currentPath: cur,
  };
}
