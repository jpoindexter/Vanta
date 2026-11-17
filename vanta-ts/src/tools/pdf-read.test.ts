import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  pdfReadTool,
  checkPdfSize,
  extractText,
  type PdfExtractor,
} from "./pdf-read.js";
import type { ToolContext } from "./types.js";

let root: string;

/** A ToolContext carrying an injected extractor so the live tool needs no real PDF. */
function ctx(extractor?: PdfExtractor): ToolContext {
  return {
    root,
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
    ...(extractor ? { pdfExtractor: extractor } : {}),
  } as ToolContext;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-pdf-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("checkPdfSize", () => {
  it("accepts a file at or under the limit and reports the clamped limit", () => {
    expect(checkPdfSize(1000)).toEqual({ ok: true, limit: 25 * 1024 * 1024 });
  });

  it("rejects a file over the requested limit with an actionable message", () => {
    const res = checkPdfSize(2000, 1000);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("2000 bytes");
      expect(res.error).toContain("1000-byte limit");
    }
  });

  it("clamps a max_bytes above the hard cap so it can't raise the ceiling", () => {
    const huge = 999 * 1024 * 1024;
    const res = checkPdfSize(60 * 1024 * 1024, huge);
    expect(res.ok).toBe(false); // 60MB > the 50MB hard cap, despite the huge request
  });
});

describe("extractText", () => {
  it("extracts and joins page text from a mocked extractor", async () => {
    const fake: PdfExtractor = async () => ["page one", "page two"];
    const res = await extractText(new Uint8Array(), fake);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.text).toBe("page one\n\npage two");
  });

  it("returns an error for an empty/image-only PDF (no extractable text)", async () => {
    const fake: PdfExtractor = async () => ["", "   "];
    const res = await extractText(new Uint8Array(), fake);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("no extractable text");
  });

  it("maps a PasswordException to an encrypted-PDF error (never throws)", async () => {
    const fake: PdfExtractor = async () => {
      const e = new Error("No password given") as Error & { name: string };
      e.name = "PasswordException";
      throw e;
    };
    const res = await extractText(new Uint8Array(), fake);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("encrypted");
  });

  it("maps an InvalidPDFException to a corrupt-PDF error (never throws)", async () => {
    const fake: PdfExtractor = async () => {
      const e = new Error("Invalid PDF structure") as Error & { name: string };
      e.name = "InvalidPDFException";
      throw e;
    };
    const res = await extractText(new Uint8Array(), fake);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("corrupt");
  });

  it("truncates text that exceeds the output cap", async () => {
    const fake: PdfExtractor = async () => ["x".repeat(200_000)];
    const res = await extractText(new Uint8Array(), fake);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.text.length).toBeLessThanOrEqual(120_000);
      expect(res.text).toContain("[truncated]");
    }
  });
});

describe("pdf_read tool", () => {
  it("extracts a real PDF through the installed parser without an injected extractor", async () => {
    const text = "Dependency security PDF smoke";
    const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (const [index, object] of objects.entries()) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
    pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
    pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    await writeFile(join(root, "real.pdf"), pdf);
    const result = await pdfReadTool.execute({ path: "real.pdf" }, ctx());
    expect(result.ok, result.output).toBe(true);
    expect(result.output).toContain(text);
  });

  it("describeForSafety returns the path (read op → kernel Allow)", () => {
    expect(pdfReadTool.describeForSafety?.({ path: "docs/spec.pdf" })).toBe("read pdf docs/spec.pdf");
  });

  it("extracts text from a scoped PDF using an injected extractor", async () => {
    await writeFile(join(root, "doc.pdf"), "%PDF-1.4 fake bytes");
    const res = await pdfReadTool.execute(
      { path: "doc.pdf" },
      ctx(async () => ["hello from the pdf"]),
    );
    expect(res.ok).toBe(true);
    expect(res.output).toBe("hello from the pdf");
  });

  it("rejects a file over the max-size limit (errors-as-values)", async () => {
    await writeFile(join(root, "big.pdf"), "x".repeat(5000));
    const res = await pdfReadTool.execute(
      { path: "big.pdf", max_bytes: 100 },
      ctx(async () => ["never reached"]),
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("over the");
  });

  it("returns an error for a missing file", async () => {
    const res = await pdfReadTool.execute({ path: "nope.pdf" }, ctx(async () => ["x"]));
    expect(res.ok).toBe(false);
    expect(res.output).toContain("no such file");
  });

  it("refuses a path outside the project scope", async () => {
    const res = await pdfReadTool.execute({ path: "../escape.pdf" }, ctx(async () => ["x"]));
    expect(res.ok).toBe(false);
    expect(res.output).toContain("outside the project scope");
  });

  it("rejects a non-.pdf path", async () => {
    const res = await pdfReadTool.execute({ path: "notes.txt" }, ctx(async () => ["x"]));
    expect(res.ok).toBe(false);
    expect(res.output).toContain("not a .pdf");
  });

  it("rejects missing/invalid args (never throws)", async () => {
    const res = await pdfReadTool.execute({}, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain('needs a "path"');
  });
});
