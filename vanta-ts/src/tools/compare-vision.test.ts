import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compareVision, compareVisionTool } from "./compare-vision.js";
import type { ToolContext } from "./types.js";
import type { LLMProvider, CompletionResult } from "../providers/interface.js";

// Minimal 1x1 transparent PNG — real bytes so readFile succeeds.
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

/** Replays scripted completions in order. */
class FakeVisionProvider implements LLMProvider {
  private index = 0;
  constructor(private readonly turns: CompletionResult[]) {}
  async complete(): Promise<CompletionResult> {
    return (
      this.turns[this.index++] ?? { text: "ok", toolCalls: [], finishReason: "stop" }
    );
  }
  modelId(): string { return "fake-vision"; }
  contextWindow(): number { return 100_000; }
}

const makeCtx = (root: string): ToolContext => ({
  root,
  safety: {} as ToolContext["safety"],
  requestApproval: async () => {
    throw new Error("requestApproval must not be called in these tests");
  },
});

// ---------------------------------------------------------------------------
// Schema / metadata tests
// ---------------------------------------------------------------------------
describe("compareVisionTool schema", () => {
  it("has the correct name", () => {
    expect(compareVisionTool.schema.name).toBe("compare_vision");
  });

  it("requires images field", () => {
    const required = compareVisionTool.schema.parameters.required as string[];
    expect(required).toContain("images");
  });

  it("focus is not required", () => {
    const required = (compareVisionTool.schema.parameters.required as string[]) ?? [];
    expect(required).not.toContain("focus");
  });

  it("describeForSafety returns kernel-Allow string", () => {
    const desc = compareVisionTool.describeForSafety?.({ images: ["a.png"] });
    expect(desc).toBe("analyze and compare images");
  });
});

// ---------------------------------------------------------------------------
// compareVision core (injectable provider) tests
// ---------------------------------------------------------------------------
describe("compareVision core", () => {
  it("returns a critique string for a single image", async () => {
    const provider = new FakeVisionProvider([
      { text: "A clean minimal layout with strong contrast.", toolCalls: [], finishReason: "stop" },
      { text: "**Ranked recommendation**\nImage 1 fits best — minimal layout.\n\n**Per-image critique**\nimage.png: Clean, high contrast, effective hierarchy.\n\n**Direction note**\nThe winner leads with whitespace.", toolCalls: [], finishReason: "stop" },
    ]);
    const result = await compareVision({
      provider,
      images: [{ label: "image.png", mime: "image/png", dataBase64: PIXEL_PNG.toString("base64") }],
      prefs: "",
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("focus param is optional — works without it", async () => {
    const provider = new FakeVisionProvider([
      { text: "Description without focus.", toolCalls: [], finishReason: "stop" },
      { text: "Synthesis without focus.", toolCalls: [], finishReason: "stop" },
    ]);
    // No focus arg — TypeScript should accept this (focus is optional on the type)
    const result = await compareVision({
      provider,
      images: [{ label: "a.png", mime: "image/png", dataBase64: PIXEL_PNG.toString("base64") }],
      prefs: "",
    });
    expect(result).toContain("Synthesis");
  });

  it("includes brand preference context in synthesis when prefs are non-empty", async () => {
    let capturedPrompt = "";
    const provider: LLMProvider = {
      async complete(msgs) {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && typeof lastMsg.content === "string") {
          capturedPrompt = lastMsg.content;
        }
        return { text: "ok", toolCalls: [], finishReason: "stop" };
      },
      modelId: () => "fake",
      contextWindow: () => 100_000,
    };
    await compareVision({
      provider,
      images: [{ label: "b.png", mime: "image/png", dataBase64: PIXEL_PNG.toString("base64") }],
      prefs: "Prefer illustrated/line-drawing style over hyper-realistic imagery.",
    });
    expect(capturedPrompt).toContain("brand preferences");
    expect(capturedPrompt).toContain("illustrated");
  });
});

// ---------------------------------------------------------------------------
// execute() integration tests (in-scope / out-of-scope path handling)
// ---------------------------------------------------------------------------
describe("compareVisionTool.execute", () => {
  let dir: string;
  const savedProvider = process.env.VANTA_PROVIDER;
  const savedKey = process.env.OPENAI_API_KEY;
  const savedReadable = process.env.VANTA_READABLE_DIRS;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-cvision-"));
    await writeFile(join(dir, "screen.png"), PIXEL_PNG);
  });

  afterEach(async () => {
    if (savedProvider === undefined) delete process.env.VANTA_PROVIDER;
    else process.env.VANTA_PROVIDER = savedProvider;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
    if (savedReadable === undefined) delete process.env.VANTA_READABLE_DIRS;
    else process.env.VANTA_READABLE_DIRS = savedReadable;
    await rm(dir, { recursive: true, force: true });
  });

  it("returns ok:false for missing images argument", async () => {
    const res = await compareVisionTool.execute({}, makeCtx(dir));
    expect(res.ok).toBe(false);
    expect(res.output).toContain("compare_vision needs");
  });

  it("returns ok:false for an out-of-zone image when the user denies the scope ask", async () => {
    process.env.VANTA_READABLE_DIRS = "/tmp/vanta-allowed-zone";
    const res = await compareVisionTool.execute(
      { images: ["/var/somewhere/else/escape.png"] },
      { ...makeCtx(dir), requestApproval: async () => false },
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("readable zone");
  });

  it("allows a ~/Desktop image past the scope gate (BUG-IMAGE-DESKTOP-PATH)", async () => {
    delete process.env.VANTA_READABLE_DIRS; // default zones include ~/Desktop
    const res = await compareVisionTool.execute(
      { images: ["~/Desktop/vanta-nonexistent-test-file.png"] },
      makeCtx(dir),
    );
    // ~ expanded + Desktop is a readable zone → past the gate, then read fails (ENOENT).
    expect(res.output).not.toContain("readable zone");
    expect(res.output).toContain("could not read");
  });

  it("returns ok:false for an unsupported image extension", async () => {
    await writeFile(join(dir, "doc.pdf"), "not an image");
    const res = await compareVisionTool.execute(
      { images: ["doc.pdf"] },
      makeCtx(dir),
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("unsupported image type");
  });

  it("returns ok:false when the provider has no key (no network call)", async () => {
    process.env.VANTA_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "";
    const res = await compareVisionTool.execute(
      { images: ["screen.png"] },
      makeCtx(dir),
    );
    expect(res.ok).toBe(false);
  });
});
