import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lspDiagnosticsTool, lspDefinitionTool } from "./lsp.js";
import type { ToolContext } from "./types.js";

// Validation, scope, and extension checks all run without a real ctx beyond root.
const ctx = { root: process.cwd() } as ToolContext;

describe("lspDiagnosticsTool", () => {
  it("returns an actionable error when path is missing", async () => {
    const result = await lspDiagnosticsTool.execute({}, ctx);

    expect(result.ok).toBe(false);
    expect(result.output).toBe('lsp_diagnostics needs a "path" string');
  });

  it("refuses a non-ts file", async () => {
    const result = await lspDiagnosticsTool.execute({ path: "README.md" }, ctx);

    expect(result.ok).toBe(false);
    expect(result.output).toBe("lsp_diagnostics supports .ts/.tsx");
  });

  it("refuses a path outside the project scope", async () => {
    const result = await lspDiagnosticsTool.execute(
      { path: "../escape.ts" },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toContain("outside project scope");
  });

  it("describes a diagnostics call with only the path, no content", () => {
    const description = lspDiagnosticsTool.describeForSafety?.({
      path: "src/app.ts",
    });

    expect(description).toBe("diagnostics src/app.ts");
  });

  it("returns diagnostics for a clean in-scope .ts file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-lsp-test-"));
    try {
      const file = join(dir, "clean.ts");
      await writeFile(file, "export const answer: number = 42;\n", "utf8");

      const fileCtx = { root: dir } as ToolContext;
      const result = await lspDiagnosticsTool.execute({ path: "clean.ts" }, fileCtx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe("(no diagnostics)");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("lspDefinitionTool", () => {
  it("returns an actionable error when args are missing", async () => {
    const result = await lspDefinitionTool.execute({ path: "src/app.ts" }, ctx);

    expect(result.ok).toBe(false);
    expect(result.output).toBe(
      'lsp_definition needs "path", "line", and "character"',
    );
  });

  it("returns an actionable error when line is not an integer", async () => {
    const result = await lspDefinitionTool.execute(
      { path: "src/app.ts", line: 1.5, character: 0 },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe(
      'lsp_definition needs "path", "line", and "character"',
    );
  });

  it("refuses a non-ts file", async () => {
    const result = await lspDefinitionTool.execute(
      { path: "README.md", line: 0, character: 0 },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe("lsp_definition supports .ts/.tsx");
  });

  it("refuses a path outside the project scope", async () => {
    const result = await lspDefinitionTool.execute(
      { path: "../escape.ts", line: 0, character: 0 },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toContain("outside project scope");
  });

  it("describes a definition call with only the path, no content", () => {
    const description = lspDefinitionTool.describeForSafety?.({
      path: "src/app.ts",
    });

    expect(description).toBe("definition src/app.ts");
  });
});
