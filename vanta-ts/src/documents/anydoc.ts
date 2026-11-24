import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Readable } from "node:stream";
import { buildSafeChildEnv } from "../exec/child-env.js";

export type DocumentConvertCode =
  | "unsupported"
  | "malformed"
  | "encrypted"
  | "resourceLimit"
  | "missingPart"
  | "io";

export type DocumentConverter = (bytes: Uint8Array, extension: string) => Promise<string>;

export type DocumentConvertOptions = {
  env?: NodeJS.ProcessEnv;
  executablePath?: string;
  workerPath?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxOutputBytes?: number;
};

export const DOCUMENT_MAX_INPUT_BYTES = 50 * 1024 * 1024;
export const SCANNED_PDF_MESSAGE =
  "PDF has no locally extractable text; OCR required for scanned/image-only pages. The file was not uploaded or sent to a hosted fallback.";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_ERROR_BYTES = 16 * 1024;

export const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([
  ".doc", ".docx", ".docm", ".ppt", ".pps", ".pot", ".pptx", ".pptm", ".ppsx", ".ppsm",
  ".xls", ".xlsx", ".xlsm", ".xlsb", ".odt", ".ods", ".odp", ".rtf", ".epub", ".csv", ".pdf",
]);

export class DocumentConversionError extends Error {
  readonly code: DocumentConvertCode;

  constructor(code: DocumentConvertCode, message: string) {
    super(message);
    this.name = "DocumentConversionError";
    this.code = code;
  }
}

export function normalizeDocumentExtension(extension: string): string {
  const normalized = extension.trim().toLowerCase();
  if (!normalized) return "";
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

export function isSupportedDocumentExtension(extension: string): boolean {
  return SUPPORTED_DOCUMENT_EXTENSIONS.has(normalizeDocumentExtension(extension));
}

export function buildDocumentChildEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...buildSafeChildEnv(env),
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
  };
}

export async function convertDocumentBytes(
  bytes: Uint8Array,
  extension: string,
  options: DocumentConvertOptions = {},
): Promise<string> {
  const normalized = normalizeDocumentExtension(extension);
  if (!isSupportedDocumentExtension(normalized)) {
    throw new DocumentConversionError("unsupported", `unsupported document extension: ${normalized || "(none)"}`);
  }
  const maxInputBytes = Math.min(options.maxInputBytes ?? DOCUMENT_MAX_INPUT_BYTES, DOCUMENT_MAX_INPUT_BYTES);
  if (bytes.byteLength > maxInputBytes) {
    throw new DocumentConversionError("resourceLimit", `document exceeds the ${maxInputBytes}-byte conversion limit`);
  }
  return runDocumentWorker(bytes, normalized, options);
}

async function runDocumentWorker(
  bytes: Uint8Array,
  extension: string,
  options: DocumentConvertOptions,
): Promise<string> {
  const workerPath = options.workerPath ?? fileURLToPath(new URL("./anydoc-worker.mjs", import.meta.url));
  const child = spawn(options.executablePath ?? process.execPath, [workerPath, extension], {
    env: buildDocumentChildEnv(options.env),
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  try {
    return await collectWorkerResult(child, options);
  } catch (error) {
    if (!child.killed) child.kill("SIGKILL");
    throw normalizeChildError(error);
  }
}

async function collectWorkerResult(
  child: ChildProcessWithoutNullStreams,
  options: DocumentConvertOptions,
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new DocumentConversionError(
      "resourceLimit",
      `local document conversion timed out after ${timeoutMs}ms`,
    )), timeoutMs);
  });
  try {
    const work = Promise.all([
      waitForChild(child),
      readLimited(child.stdout, options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES),
      readLimited(child.stderr, MAX_ERROR_BYTES),
    ]);
    const [{ code }, stdout, stderr] = await Promise.race([work, timeout]);
    if (code === 0) return stdout;
    throw parseWorkerError(stderr);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readLimited(stream: Readable, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const raw of stream) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    total += chunk.byteLength;
    if (total > limit) throw new DocumentConversionError("resourceLimit", "document conversion output exceeded its safety limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function waitForChild(child: ChildProcessWithoutNullStreams): Promise<{ code: number | null }> {
  return new Promise((resolve, reject) => {
    child.once("error", (error) => reject(new DocumentConversionError("io", `could not start local document converter: ${error.message}`)));
    child.once("close", (code) => resolve({ code }));
  });
}

function parseWorkerError(stderr: string): DocumentConversionError {
  try {
    const parsed = JSON.parse(stderr.trim()) as { code?: unknown; message?: unknown };
    const code = String(parsed.code ?? "");
    if (isDocumentConvertCode(code)) {
      const message = typeof parsed.message === "string" ? parsed.message.slice(0, 500) : "local document conversion failed";
      return new DocumentConversionError(code, message);
    }
  } catch {
    // Malformed worker output is intentionally collapsed to a leak-free error.
  }
  return new DocumentConversionError("malformed", "local document conversion failed");
}

function normalizeChildError(error: unknown): DocumentConversionError {
  if (error instanceof DocumentConversionError) return error;
  return new DocumentConversionError("io", "local document conversion process failed");
}

function isDocumentConvertCode(value: string): value is DocumentConvertCode {
  return ["unsupported", "malformed", "encrypted", "resourceLimit", "missingPart", "io"].includes(value);
}
