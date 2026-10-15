import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type MetadataStamp = {
  path: string;
  kind: "file" | "directory" | "missing";
  size: number | null;
  mtimeMs: number | null;
};

type MetadataEnvelope<T> = {
  version: number;
  manifest: MetadataStamp[];
  value: T;
};

async function stamp(path: string): Promise<MetadataStamp> {
  const absolute = resolve(path);
  try {
    const info = await stat(absolute);
    return {
      path: absolute,
      kind: info.isDirectory() ? "directory" : "file",
      size: info.size,
      mtimeMs: info.mtimeMs,
    };
  } catch {
    return { path: absolute, kind: "missing", size: null, mtimeMs: null };
  }
}

async function manifest(paths: readonly string[]): Promise<MetadataStamp[]> {
  const unique = [...new Set(paths.map((path) => resolve(path)))].sort();
  return Promise.all(unique.map(stamp));
}

function validEnvelope(value: unknown, version: number): value is MetadataEnvelope<unknown> {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<MetadataEnvelope<unknown>>;
  return envelope.version === version && Array.isArray(envelope.manifest) && "value" in envelope;
}

export async function readMetadataCache<T>(cachePath: string, version: number): Promise<T | null> {
  let envelope: MetadataEnvelope<T>;
  try {
    const parsed: unknown = JSON.parse(await readFile(cachePath, "utf8"));
    if (!validEnvelope(parsed, version)) return null;
    envelope = parsed as MetadataEnvelope<T>;
  } catch {
    return null;
  }

  const current = await manifest(envelope.manifest.map((entry) => entry.path));
  return JSON.stringify(current) === JSON.stringify(envelope.manifest) ? envelope.value : null;
}

export async function writeMetadataCache<T>(
  cachePath: string,
  version: number,
  value: T,
  sourcePaths: readonly string[],
): Promise<void> {
  const folder = dirname(cachePath);
  const temporary = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const envelope: MetadataEnvelope<T> = {
    version,
    manifest: await manifest(sourcePaths),
    value,
  };
  await writeFile(temporary, `${JSON.stringify(envelope)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, cachePath);
  await chmod(cachePath, 0o600);
}
