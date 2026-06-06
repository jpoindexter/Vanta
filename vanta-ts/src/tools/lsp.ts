import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveInScope } from "../scope.js";
import { getDiagnostics, getDefinition } from "../lsp/ts-service.js";

const DiagnosticsArgs = z.object({ path: z.string().min(1) });
const DefinitionArgs = z.object({
  path: z.string().min(1),
  line: z.number().int(),
  character: z.number().int(),
});

// The TS language service only understands TypeScript source files.
const TS_FILE = /\.tsx?$/;

export const lspDiagnosticsTool: Tool = {
  schema: {
    name: "lsp_diagnostics",
    description:
      "Report TypeScript diagnostics (errors and warnings) for a .ts/.tsx file inside the project scope.",
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
  describeForSafety: (a) => `diagnostics ${String(a.path ?? "")}`,
  async execute(raw, ctx) {
    const parsed = DiagnosticsArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'lsp_diagnostics needs a "path" string' };
    }
    const { ok, path: abs } = resolveInScope(parsed.data.path, ctx.root);
    if (!ok) {
      return {
        ok: false,
        output: `refused: path is outside project scope: ${parsed.data.path}`,
      };
    }
    if (!TS_FILE.test(abs)) {
      return { ok: false, output: "lsp_diagnostics supports .ts/.tsx" };
    }
    try {
      const hits = await getDiagnostics(abs);
      if (hits.length === 0) {
        return { ok: true, output: "(no diagnostics)" };
      }
      const lines = hits.map(
        (d) => `${d.line}:${d.character} ${d.category} ${d.message}`,
      );
      return { ok: true, output: lines.join("\n") };
    } catch (err) {
      return {
        ok: false,
        output: `could not get diagnostics for ${parsed.data.path}: ${(err as Error).message}`,
      };
    }
  },
};

export const lspDefinitionTool: Tool = {
  schema: {
    name: "lsp_definition",
    description:
      "Find the definition site(s) of the symbol at a position in a .ts/.tsx file inside the project scope.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to a .ts/.tsx file relative to the project root",
        },
        line: { type: "number", description: "Zero-based line of the symbol" },
        character: {
          type: "number",
          description: "Zero-based character offset of the symbol",
        },
      },
      required: ["path", "line", "character"],
    },
  },
  describeForSafety: (a) => `definition ${String(a.path ?? "")}`,
  async execute(raw, ctx) {
    const parsed = DefinitionArgs.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        output: 'lsp_definition needs "path", "line", and "character"',
      };
    }
    const { path, line, character } = parsed.data;
    const { ok, path: abs } = resolveInScope(path, ctx.root);
    if (!ok) {
      return {
        ok: false,
        output: `refused: path is outside project scope: ${path}`,
      };
    }
    if (!TS_FILE.test(abs)) {
      return { ok: false, output: "lsp_definition supports .ts/.tsx" };
    }
    try {
      const hits = await getDefinition(abs, line, character);
      if (hits.length === 0) {
        return { ok: true, output: "(no definition found)" };
      }
      const lines = hits.map((d) => `${d.file}:${d.line}:${d.character}`);
      return { ok: true, output: lines.join("\n") };
    } catch (err) {
      return {
        ok: false,
        output: `could not get definition for ${path}: ${(err as Error).message}`,
      };
    }
  },
};
