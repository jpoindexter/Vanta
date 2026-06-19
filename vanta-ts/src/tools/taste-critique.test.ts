import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tasteCritiqueTool } from "./taste-critique.js";
import type { ToolContext } from "./types.js";

function ctx(root: string): ToolContext {
  return { root, safety: {} as ToolContext["safety"], requestApproval: async () => true };
}

describe("tasteCritiqueTool", () => {
  let home: string;
  let root: string;
  let prev: string | undefined;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-tc-home-"));
    root = await mkdtemp(join(tmpdir(), "vanta-tc-root-"));
    prev = process.env.VANTA_HOME;
    process.env.VANTA_HOME = home;
  });
  afterEach(async () => {
    if (prev === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = prev;
    await rm(home, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });

  it("scores inline content on five axes and records it", async () => {
    const r = await tasteCritiqueTool.execute(
      { action: "score", artifact: "tagline", content: "Run vanta. It checks 3 things in 1s." },
      ctx(root),
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain("Overall:");
    expect(r.output).toContain("clarity");
    const hist = await tasteCritiqueTool.execute({ action: "history", artifact: "tagline" }, ctx(root));
    expect(hist.output).toContain("[single]");
  });

  it("requires content or path for score", async () => {
    const r = await tasteCritiqueTool.execute({ action: "score", artifact: "x" }, ctx(root));
    expect(r.ok).toBe(false);
    expect(r.output).toContain("content or path");
  });

  it("scores an artifact read from an in-scope path", async () => {
    await writeFile(join(root, "page.html"), "<h1>Real heading</h1><p>Open the file and run it.</p>", "utf8");
    const r = await tasteCritiqueTool.execute({ action: "score", path: "page.html" }, ctx(root));
    expect(r.ok).toBe(true);
    expect(r.output).toContain("page.html");
  });

  it("refuses a path outside scope", async () => {
    const r = await tasteCritiqueTool.execute({ action: "score", path: "../../etc/hosts" }, ctx(root));
    expect(r.ok).toBe(false);
    expect(r.output).toContain("outside scope");
  });

  it("records before/after and prints the delta", async () => {
    await tasteCritiqueTool.execute(
      { action: "before", artifact: "hero", content: "lorem ipsum revolutionary synergy" },
      ctx(root),
    );
    const after = await tasteCritiqueTool.execute(
      { action: "after", artifact: "hero", content: "Run `vanta doctor`. Step 1: build. 3 checks in 1s." },
      ctx(root),
    );
    expect(after.ok).toBe(true);
    expect(after.output).toContain("Overall delta:");
  });

  it("shows brand-safe defaults", async () => {
    const r = await tasteCritiqueTool.execute({ action: "brand" }, ctx(root));
    expect(r.ok).toBe(true);
    expect(r.output).toContain("blue-to-purple gradients");
    expect(r.output).toContain("8pt spacing scale");
  });

  it("learns a durable preference and surfaces it in brand", async () => {
    const r = await tasteCritiqueTool.execute(
      { action: "prefer", preference: "monospace, terminal-native" },
      ctx(root),
    );
    expect(r.ok).toBe(true);
    const brand = await tasteCritiqueTool.execute({ action: "brand" }, ctx(root));
    expect(brand.output).toContain("monospace, terminal-native");
  });

  it("describeForSafety returns the action and path", () => {
    expect(tasteCritiqueTool.describeForSafety?.({ action: "score", path: "a.html" })).toBe(
      "taste_critique score a.html",
    );
    expect(tasteCritiqueTool.describeForSafety?.({ action: "brand" })).toBe("taste_critique brand");
  });

  it("rejects unknown action shape", async () => {
    const r = await tasteCritiqueTool.execute({ action: "nope" }, ctx(root));
    expect(r.ok).toBe(false);
  });
});
