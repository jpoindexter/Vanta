import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  capDocumentOutput,
  checkDocumentSize,
  documentReadTool,
  type DocumentConverter,
} from "./document-read.js";
import type { ToolContext } from "./types.js";

let root: string;
let outsideRoot: string;

function ctx(converter?: DocumentConverter): ToolContext {
  return {
    root,
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
    ...(converter ? { documentConverter: converter } : {}),
  } as ToolContext;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-document-test-"));
  outsideRoot = await mkdtemp(join(tmpdir(), "vanta-document-outside-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
});

describe("document_read policy", () => {
  it("clamps size requests to the hard boundary", () => {
    expect(checkDocumentSize(60 * 1024 * 1024, 999 * 1024 * 1024).ok).toBe(false);
    expect(checkDocumentSize(1_000, 2_000)).toEqual({ ok: true, limit: 2_000 });
  });

  it("caps extracted Markdown before it enters model context", () => {
    const output = capDocumentOutput("x".repeat(130_000));
    expect(output.length).toBeLessThanOrEqual(120_000);
    expect(output).toContain("[truncated]");
  });

  it("converts a scoped CSV through the real local AnyDoc child", async () => {
    await writeFile(join(root, "data.csv"), "name,value\nVanta,local\n");
    const result = await documentReadTool.execute({ path: "data.csv" }, ctx());
    expect(result.ok).toBe(true);
    expect(result.output).toContain("Vanta");
    expect(result.output).toContain("local");
  });

  it("converts a real RTF document through the local native parser", async () => {
    await writeFile(join(root, "brief.rtf"), "{\\rtf1\\ansi\\deff0 Vanta document reader}");
    const result = await documentReadTool.execute({ path: "brief.rtf" }, ctx());
    expect(result.ok).toBe(true);
    expect(result.output).toContain("Vanta document reader");
  });

  it("passes bytes and the normalized extension to an injected converter", async () => {
    await writeFile(join(root, "brief.DOCX"), "fake docx bytes");
    const converter: DocumentConverter = async (bytes, extension) => {
      expect(bytes.byteLength).toBeGreaterThan(0);
      expect(extension).toBe(".docx");
      return "# Vanta brief";
    };
    await expect(documentReadTool.execute({ path: "brief.DOCX" }, ctx(converter)))
      .resolves.toEqual({ ok: true, output: "# Vanta brief" });
  });

  it("reports scanned PDFs honestly and does not imply a hosted fallback", async () => {
    await writeFile(join(root, "scan.pdf"), "%PDF-1.7");
    const converter: DocumentConverter = async () => {
      throw Object.assign(new Error("image-only"), { code: "unsupported" });
    };
    const result = await documentReadTool.execute({ path: "scan.pdf" }, ctx(converter));
    expect(result.ok).toBe(false);
    expect(result.output).toContain("OCR required");
    expect(result.output).toContain("not uploaded");
  });

  it("rejects an in-project symlink that escapes the project before conversion", async () => {
    const outside = join(outsideRoot, "private.docx");
    await writeFile(outside, "outside-project content");
    await symlink(outside, join(root, "linked.docx"));
    let converterCalled = false;
    const converter: DocumentConverter = async () => {
      converterCalled = true;
      return "leaked";
    };

    const result = await documentReadTool.execute({ path: "linked.docx" }, ctx(converter));

    expect(result.ok).toBe(false);
    expect(result.output).toContain("outside the project scope");
    expect(converterCalled).toBe(false);
  });

  it("returns errors as values for unsafe, missing, and unsupported paths", async () => {
    await expect(documentReadTool.execute({ path: "../escape.docx" }, ctx()))
      .resolves.toMatchObject({ ok: false, output: expect.stringContaining("outside") });
    await expect(documentReadTool.execute({ path: "missing.docx" }, ctx()))
      .resolves.toMatchObject({ ok: false, output: expect.stringContaining("no such file") });
    await expect(documentReadTool.execute({ path: "notes.txt" }, ctx()))
      .resolves.toMatchObject({ ok: false, output: expect.stringContaining("unsupported") });
  });
});
