import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { looksBinary, languageForPath, mimeTypeForPath } from "./media-types";
import { TEXT_PREVIEW_MAX_BYTES } from "./fs-read";
import { previewHttpUrlTarget } from "../preview-url-target";
import type { ProjectGuard } from "./project-guard";

const HTML = new Set([".html", ".htm"]);
const BINARY_SAMPLE_BYTES = 4096;
const MAX_TARGET_LENGTH = 4096;

type PreviewKind = "binary" | "directory" | "html" | "image" | "missing" | "pdf" | "text";

export interface FilePreviewTarget {
  binary?: boolean;
  byteSize?: number;
  kind: "file";
  label: string;
  language?: string;
  large?: boolean;
  mimeType?: string;
  path: string;
  previewKind: PreviewKind;
  source: string;
  url: string;
}

/** A chat link may be a file:// URL, a path with percent-escapes, or relative to the session folder. */
function pathFromTarget(raw: string): string {
  const decoded = (value: string): string => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  if (/^file:\/\//i.test(raw)) {
    try {
      return fileURLToPath(raw);
    } catch {
      return "";
    }
  }

  return decoded(raw);
}

async function sampleIsBinary(real: string, mimeType: string): Promise<boolean> {
  if (mimeType.startsWith("image/")) {
    return false;
  }

  const handle = await fsp.open(real, "r").catch(() => null);

  if (!handle) {
    return false;
  }

  try {
    const sample = Buffer.alloc(BINARY_SAMPLE_BYTES);
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);

    return looksBinary(sample.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

function kindOf(real: string, mimeType: string, binary: boolean): PreviewKind {
  if (HTML.has(path.extname(real).toLowerCase())) {
    return "html";
  }

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType === "application/pdf") {
    return "pdf";
  }

  return binary ? "binary" : "text";
}

async function fileTarget(guard: ProjectGuard, raw: string, base: null | string): Promise<FilePreviewTarget | null> {
  const rootReal = await guard.rootReal();
  const baseDir = base ?? rootReal;
  const wanted = pathFromTarget(raw);

  if (!baseDir || !wanted) {
    return null;
  }

  const resolved = await guard.resolve(path.isAbsolute(wanted) ? wanted : path.join(baseDir, wanted));

  if (resolved.ok === false) {
    // Inside the project but absent is a dead link the card can say so about; anything else is not previewable.
    return resolved.error.code === "missing" && !wanted.split(/[\\/]/).includes("..")
      ? missingTarget(path.isAbsolute(wanted) ? wanted : path.join(baseDir, wanted), raw, rootReal)
      : null;
  }

  const { abs, isDirectory, real, stat } = resolved.value;
  const common = { kind: "file" as const, label: path.basename(real), path: abs, source: raw, url: pathToFileURL(real).toString() };

  if (isDirectory) {
    return { ...common, previewKind: "directory" };
  }

  const mimeType = mimeTypeForPath(real);
  const binary = await sampleIsBinary(real, mimeType);

  return {
    ...common,
    binary,
    byteSize: stat.size,
    language: languageForPath(real),
    large: stat.size > TEXT_PREVIEW_MAX_BYTES,
    mimeType,
    previewKind: kindOf(real, mimeType, binary)
  };
}

function missingTarget(wanted: string, raw: string, root: null | string): FilePreviewTarget | null {
  const lexical = path.normalize(wanted);

  if (!root || !(lexical === root || lexical.startsWith(`${root}${path.sep}`))) {
    return null;
  }

  return { kind: "file", label: path.basename(lexical), path: lexical, previewKind: "missing", source: raw, url: pathToFileURL(lexical).toString() };
}

async function baseDirOf(guard: ProjectGuard, baseDir: unknown): Promise<null | string> {
  if (typeof baseDir !== "string" || !baseDir) {
    return null;
  }

  const found = await guard.resolve(baseDir, "dir");

  return found.ok ? found.value.real : null;
}

export type PreviewTarget = FilePreviewTarget | NonNullable<ReturnType<typeof previewHttpUrlTarget>>;

/** The target of a preview link: an http(s) page, or a file that lives inside the project. Anything else is null. */
export async function normalizePreviewTarget(guard: ProjectGuard, rawTarget: unknown, baseDir: unknown): Promise<null | PreviewTarget> {
  const raw = typeof rawTarget === "string" ? rawTarget.trim() : "";

  if (!raw || raw.length > MAX_TARGET_LENGTH || raw.includes("\0")) {
    return null;
  }

  if (/^https?:\/\//i.test(raw)) {
    return previewHttpUrlTarget(raw);
  }

  // Any other scheme (javascript:, data:, ssh:) is not a file. Only file: URLs fall through to the path logic.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^file:\/\//i.test(raw)) {
    return null;
  }

  return fileTarget(guard, raw, await baseDirOf(guard, baseDir));
}

/** A file:// URL or a path, as the watch calls receive it, down to a guarded absolute path. */
export function watchTargetPath(raw: unknown): string {
  return typeof raw === "string" && raw ? pathFromTarget(raw.trim()) : "";
}
