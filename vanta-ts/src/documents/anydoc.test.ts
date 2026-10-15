import { describe, expect, it } from "vitest";
import {
  DocumentConversionError,
  buildDocumentChildEnv,
  convertDocumentBytes,
  isSupportedDocumentExtension,
} from "./anydoc.js";

describe("local AnyDoc conversion boundary", () => {
  it("recognizes the document formats Vanta exposes", () => {
    for (const extension of [".docx", ".pptx", ".xlsx", ".odt", ".rtf", ".epub", ".csv", ".pdf"]) {
      expect(isSupportedDocumentExtension(extension)).toBe(true);
    }
    expect(isSupportedDocumentExtension(".txt")).toBe(false);
    expect(isSupportedDocumentExtension(".png")).toBe(false);
  });

  it("strips provider and OAuth credentials from the converter child", () => {
    const env = buildDocumentChildEnv({
      PATH: "/usr/bin",
      HOME: "/tmp/vanta-home",
      OPENAI_API_KEY: "synthetic-openai-secret",
      ANTHROPIC_API_KEY: "synthetic-anthropic-secret",
      GOOGLE_ACCESS_TOKEN: "synthetic-google-secret",
    });

    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/tmp/vanta-home");
    expect(env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.GOOGLE_ACCESS_TOKEN).toBeUndefined();
  });

  it("converts CSV bytes through the installed native binding", async () => {
    const markdown = await convertDocumentBytes(
      new TextEncoder().encode("name,value\nVanta,verified\n"),
      ".csv",
    );

    expect(markdown).toContain("Vanta");
    expect(markdown).toContain("verified");
  });

  it("fails before spawning when input exceeds the configured boundary", async () => {
    await expect(convertDocumentBytes(new Uint8Array(5), ".csv", { maxInputBytes: 4 }))
      .rejects.toMatchObject({ code: "resourceLimit" });
  });

  it("uses a typed error for unsupported extensions", async () => {
    const failure = convertDocumentBytes(new Uint8Array([1]), ".png");
    await expect(failure).rejects.toBeInstanceOf(DocumentConversionError);
    await expect(failure).rejects.toMatchObject({ code: "unsupported" });
  });
});
