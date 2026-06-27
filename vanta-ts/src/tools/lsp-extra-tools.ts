import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveInScope } from "../scope.js";
import {
  findReferences,
  documentSymbols,
  hoverInfo,
} from "../lsp/ts-service-extra.js";

// The TS language service only understands TypeScript source files.
const TS_FILE = /\.tsx?$/;

const PositionArgs = z.object({
  path: z.string().min(1),
  line: z.number().int(),
  character: z.number().int(),
});
const SymbolsArgs = z.object({ path: z.string().min(1) });

/** Shared path schema for the position-based capabilities. */
const POSITION_PROPS = {
  path: {
    type: "string",
    description: "Path to a .ts/.tsx file relative to the project root",
  },
  line: { type: "number", description: "Zero-based line of the symbol" },
  character: {
    type: "number",
    description: "Zero-based character offset of the symbol",
  },
} as const;

/** Resolve+validate a .ts/.tsx path in scope, returning the absolute path or an error string. */
function resolvePath(
  toolName: string,
  path: string,
  root: string,
): { abs: string } | { error: string } {
  const { ok, path: abs } = resolveInScope(path, root);
  if (!ok) return { error: `refused: path is outside project scope: ${path}` };
  if (!TS_FILE.test(abs)) return { error: `${toolName} supports .ts/.tsx` };
  return { abs };
}

export const lspReferencesTool: Tool = {
  schema: {
    name: "lsp_references",
    description:
      "Find every reference to the symbol at a position in a .ts/.tsx file inside the project scope.",
    parameters: {
      type: "object",
      properties: POSITION_PROPS,
      required: ["path", "line", "character"],
    },
  },
  describeForSafety: (a) => `references ${String(a.path ?? "")}`,
  async execute(raw, ctx) {
    const parsed = PositionArgs.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        output: 'lsp_references needs "path", "line", and "character"',
      };
    }
    const { path, line, character } = parsed.data;
    const r = resolvePath("lsp_references", path, ctx.root);
    if ("error" in r) return { ok: false, output: r.error };
    const hits = findReferences(r.abs, line, character);
    if (hits.length === 0) return { ok: true, output: "(no references found)" };
    const lines = hits.map(
      (ref) => `${ref.file}:${ref.line}:${ref.col}${ref.text ? `  ${ref.text}` : ""}`,
    );
    return { ok: true, output: lines.join("\n") };
  },
};

export const lspSymbolsTool: Tool = {
  schema: {
    name: "lsp_symbols",
    description:
      "List the document symbols (declarations) of a .ts/.tsx file inside the project scope.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to a .ts/.tsx file relative to the project root",
        },
      },
      required: ["path"],
    },
  },
  describeForSafety: (a) => `symbols ${String(a.path ?? "")}`,
  async execute(raw, ctx) {
    const parsed = SymbolsArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'lsp_symbols needs a "path" string' };
    }
    const r = resolvePath("lsp_symbols", parsed.data.path, ctx.root);
    if ("error" in r) return { ok: false, output: r.error };
    const syms = documentSymbols(r.abs);
    if (syms.length === 0) return { ok: true, output: "(no symbols)" };
    const lines = syms.map((s) => `${s.line}: ${s.kind} ${s.name}`);
    return { ok: true, output: lines.join("\n") };
  },
};

export const lspHoverTool: Tool = {
  schema: {
    name: "lsp_hover",
    description:
      "Show the type/signature (quick-info) for the symbol at a position in a .ts/.tsx file inside the project scope.",
    parameters: {
      type: "object",
      properties: POSITION_PROPS,
      required: ["path", "line", "character"],
    },
  },
  describeForSafety: (a) => `hover ${String(a.path ?? "")}`,
  async execute(raw, ctx) {
    const parsed = PositionArgs.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        output: 'lsp_hover needs "path", "line", and "character"',
      };
    }
    const { path, line, character } = parsed.data;
    const r = resolvePath("lsp_hover", path, ctx.root);
    if ("error" in r) return { ok: false, output: r.error };
    const hover = hoverInfo(r.abs, line, character);
    if (!hover) return { ok: true, output: "(no hover info)" };
    const docs = hover.docs ? `\n${hover.docs}` : "";
    return { ok: true, output: `${hover.display}${docs}` };
  },
};
