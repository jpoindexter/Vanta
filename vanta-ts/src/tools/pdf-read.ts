import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { z } from "zod";
import type { Tool } from "./types.js";
import { convertDocumentBytes, SCANNED_PDF_MESSAGE } from "../documents/anydoc.js";
import { resolveProjectReadablePath } from "./writable-zones.js";

const Args = z.object({
  path: z.string().min(1),
  max_bytes: z.number().int().positive().optional(),
});

/** Default ceiling; a multi-megabyte PDF balloons into far more extracted text
 *  and is rarely useful as in-context reading material. Overridable per call up
 *  to {@link HARD_MAX_BYTES}. */
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
/** Absolute cap — a caller can lower the limit but never raise it past this, so
 *  a malicious/over-eager `max_bytes` can't be used to read an enormous file. */
const HARD_MAX_BYTES = 50 * 1024 * 1024;
/** Cap on extracted text so a dense PDF doesn't flood the context window. */
const MAX_OUTPUT = 120_000;
const TRUNCATED_MARKER = "\n\n…[truncated]";

/** An injected extractor: bytes → one string per page. Tests pass a fake while
 *  the default routes through Vanta's bounded local AnyDoc process. */
export type PdfExtractor = (bytes: Uint8Array) => Promise<string[]>;

export type SizeCheck =
  | { ok: true; limit: number }
  | { ok: false; error: string };

/**
 * Pure size guard: clamp the requested limit to the hard cap, then reject a file
 * that exceeds it. Separated so the policy is unit-testable without a real file.
 */
export function checkPdfSize(sizeBytes: number, maxBytes?: number): SizeCheck {
  const limit = Math.min(maxBytes ?? DEFAULT_MAX_BYTES, HARD_MAX_BYTES);
  if (sizeBytes > limit) {
    return {
      ok: false,
      error: `PDF is ${sizeBytes} bytes, over the ${limit}-byte limit. Pass a larger max_bytes (up to ${HARD_MAX_BYTES}) or extract a smaller file.`,
    };
  }
  return { ok: true, limit };
}

/**
 * Run the injected extractor and fold the per-page strings into one capped
 * document, mapping a failed extraction to an errors-as-value result. Pure
 * w.r.t. its `extract` arg, so the success/empty/encrypted/corrupt branches are
 * all testable with a mocked extractor — no real PDF binary.
 */
export async function extractText(
  bytes: Uint8Array,
  extract: PdfExtractor,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  let pages: string[];
  try {
    pages = await extract(bytes);
  } catch (err) {
    return { ok: false, error: classifyExtractError(err) };
  }
  const text = pages.map((p) => p.trim()).join("\n\n").trim();
  if (!text) {
    return {
      ok: false,
      error: "PDF contains no extractable text (it may be image-only/scanned, or empty).",
    };
  }
  return { ok: true, text: cap(text) };
}

/** Map a parser rejection to an actionable, leak-free message. */
function classifyExtractError(err: unknown): string {
  const code = String((err as { code?: unknown })?.code ?? "");
  const name = (err as { name?: string })?.name ?? "";
  const msg = (err as Error)?.message ?? String(err);
  const localError = classifyLocalPdfError(code);
  if (localError) return localError;
  if (name === "PasswordException" || /password/i.test(msg)) {
    return "PDF is encrypted/password-protected — cannot extract text.";
  }
  if (name === "InvalidPDFException" || /invalid pdf|corrupt|structure/i.test(msg)) {
    return "PDF is corrupt or not a valid PDF file.";
  }
  return `could not parse PDF: ${msg}`;
}

function classifyLocalPdfError(code: string): string | null {
  const messages: Record<string, string> = {
    unsupported: SCANNED_PDF_MESSAGE,
    encrypted: "PDF is encrypted/password-protected — cannot extract text.",
    resourceLimit: "PDF exceeded the local conversion safety limits.",
    malformed: "PDF is corrupt or not a valid PDF file.",
    missingPart: "PDF is corrupt or not a valid PDF file.",
    io: "PDF could not be read by the local converter.",
  };
  return messages[code] ?? null;
}

function cap(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  return text.slice(0, MAX_OUTPUT - TRUNCATED_MARKER.length) + TRUNCATED_MARKER;
}

async function anydocPdfExtractor(bytes: Uint8Array): Promise<string[]> {
  return [await convertDocumentBytes(bytes, ".pdf")];
}

export const pdfReadTool: Tool = {
  schema: {
    name: "pdf_read",
    description:
      "Locally extract text from a PDF file (scoped to the project) and return it as context without uploading it. " +
      "Enforces a max file-size limit and returns a clear error for encrypted, corrupt, " +
      "missing, or image-only PDFs.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the PDF, relative to the project root",
        },
        max_bytes: {
          type: "number",
          description: `Max file size to read in bytes (default ${DEFAULT_MAX_BYTES}, hard cap ${HARD_MAX_BYTES})`,
        },
      },
      required: ["path"],
    },
  },
  describeForSafety: (a) => `read pdf ${String(a.path ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'pdf_read needs a "path" string' };
    }
    const { path, max_bytes } = parsed.data;
    if (extname(path).toLowerCase() !== ".pdf") {
      return { ok: false, output: `not a .pdf file: ${path}` };
    }
    const scoped = resolveProjectReadablePath(path, ctx.root, process.env);
    if (!scoped.ok) {
      return { ok: false, output: scoped.error };
    }

    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(scoped.abs);
    } catch {
      return { ok: false, output: `no such file: ${path}` };
    }
    if (!info.isFile()) {
      return { ok: false, output: `not a file: ${path}` };
    }

    const size = checkPdfSize(info.size, max_bytes);
    if (!size.ok) return { ok: false, output: size.error };

    let bytes: Uint8Array;
    try {
      bytes = await readFile(scoped.abs);
    } catch (err) {
      return { ok: false, output: `could not read ${path}: ${(err as Error).message}` };
    }

    const extractor = (ctx as { pdfExtractor?: PdfExtractor }).pdfExtractor ?? anydocPdfExtractor;
    const result = await extractText(bytes, extractor);
    return result.ok
      ? { ok: true, output: result.text }
      : { ok: false, output: result.error };
  },
};
