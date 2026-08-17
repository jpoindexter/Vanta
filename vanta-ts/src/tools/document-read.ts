import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { z } from "zod";
import {
  convertDocumentBytes,
  isSupportedDocumentExtension,
  SCANNED_PDF_MESSAGE,
  type DocumentConverter as LocalDocumentConverter,
} from "../documents/anydoc.js";
import type { Tool, ToolContext } from "./types.js";
import { resolveProjectReadablePath } from "./writable-zones.js";

const Args = z.object({
  path: z.string().min(1),
  max_bytes: z.number().int().positive().optional(),
});

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const HARD_MAX_BYTES = 50 * 1024 * 1024;
const MAX_OUTPUT = 120_000;
const TRUNCATED_MARKER = "\n\n…[truncated]";

export type DocumentConverter = LocalDocumentConverter;
export type DocumentSizeCheck = { ok: true; limit: number } | { ok: false; error: string };

type LoadedDocument =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string };

export function checkDocumentSize(sizeBytes: number, maxBytes?: number): DocumentSizeCheck {
  const limit = Math.min(maxBytes ?? DEFAULT_MAX_BYTES, HARD_MAX_BYTES);
  if (sizeBytes > limit) {
    return {
      ok: false,
      error: `document is ${sizeBytes} bytes, over the ${limit}-byte limit. Pass a smaller file or max_bytes up to ${HARD_MAX_BYTES}.`,
    };
  }
  return { ok: true, limit };
}

export function capDocumentOutput(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  return text.slice(0, MAX_OUTPUT - TRUNCATED_MARKER.length) + TRUNCATED_MARKER;
}

export function classifyDocumentError(error: unknown, extension: string): string {
  const code = String((error as { code?: unknown })?.code ?? "");
  if (code === "unsupported" && extension === ".pdf") {
    return SCANNED_PDF_MESSAGE;
  }
  const messages: Record<string, string> = {
    unsupported: "document format is unsupported or contains no extractable text",
    malformed: "document is malformed or contains no meaningful content",
    encrypted: "document is encrypted or password-protected",
    resourceLimit: "document exceeded the local conversion safety limits",
    missingPart: "document is missing a required part",
    io: "document could not be read by the local converter",
  };
  return messages[code] ?? "could not parse document locally";
}

async function loadDocument(path: string, root: string, maxBytes?: number): Promise<LoadedDocument> {
  const scoped = resolveProjectReadablePath(path, root, process.env);
  if (!scoped.ok) return { ok: false, error: scoped.error };
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(scoped.abs);
  } catch {
    return { ok: false, error: `no such file: ${path}` };
  }
  if (!info.isFile()) return { ok: false, error: `not a file: ${path}` };
  const size = checkDocumentSize(info.size, maxBytes);
  if (!size.ok) return { ok: false, error: size.error };
  try {
    return { ok: true, bytes: await readFile(scoped.abs) };
  } catch {
    return { ok: false, error: `could not read document: ${path}` };
  }
}

function converterFromContext(ctx: ToolContext): DocumentConverter {
  return (ctx as ToolContext & { documentConverter?: DocumentConverter }).documentConverter ?? convertDocumentBytes;
}

export const documentReadTool: Tool = {
  schema: {
    name: "document_read",
    description:
      "Locally convert a project-scoped Word, PowerPoint, Excel, OpenDocument, RTF, EPUB, CSV, or PDF file to Markdown. " +
      "The file stays on-device; size/output limits and actionable errors cover encrypted, malformed, unsupported, and scanned files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the document, relative to the project root" },
        max_bytes: {
          type: "number",
          description: `Max file size in bytes (default ${DEFAULT_MAX_BYTES}, hard cap ${HARD_MAX_BYTES})`,
        },
      },
      required: ["path"],
    },
  },
  describeForSafety: (args) => `read document ${String(args.path ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'document_read needs a "path" string' };
    const { path, max_bytes } = parsed.data;
    const extension = extname(path).toLowerCase();
    if (!isSupportedDocumentExtension(extension)) {
      return { ok: false, output: `unsupported document extension: ${extension || "(none)"}` };
    }
    const loaded = await loadDocument(path, ctx.root, max_bytes);
    if (!loaded.ok) return { ok: false, output: loaded.error };
    try {
      const markdown = capDocumentOutput((await converterFromContext(ctx)(loaded.bytes, extension)).trim());
      return markdown
        ? { ok: true, output: markdown }
        : { ok: false, output: "document contains no extractable text" };
    } catch (error) {
      return { ok: false, output: classifyDocumentError(error, extension) };
    }
  },
};
