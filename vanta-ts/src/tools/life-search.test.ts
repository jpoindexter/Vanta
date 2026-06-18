import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { lifeSearchTool } from "./life-search.js";

describe("lifeSearchTool", () => {
  let tmpHome: string;
  let origHome: string | undefined;
  let origCwd: string;

  beforeEach(async () => {
    tmpHome = await mkdtemp(join(tmpdir(), "vanta-lifetool-test-"));
    origHome = process.env.VANTA_HOME;
    origCwd = process.cwd();
    process.env.VANTA_HOME = tmpHome;
  });

  afterEach(() => {
    if (origHome === undefined) {
      delete process.env.VANTA_HOME;
    } else {
      process.env.VANTA_HOME = origHome;
    }
    rmSync(tmpHome, { recursive: true, force: true });
  });

  const ctx = {
    root: "/",
    safety: null as unknown as import("./types.js").ToolContext["safety"],
    requestApproval: async () => true,
  };

  it("finds a term seeded into world.jsonl", async () => {
    await writeFile(
      join(tmpHome, "world.jsonl"),
      '{"id":"p1","name":"MegaCorp","type":"company"}\n',
      "utf8",
    );
    const result = await lifeSearchTool.execute({ q: "MegaCorp" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("world");
    expect(result.output).toContain("MegaCorp");
  });

  it("returns no-hits message when term is absent", async () => {
    const result = await lifeSearchTool.execute({ q: "zzznomatch" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("no local hits");
  });

  it("returns ok:false when q is missing", async () => {
    const result = await lifeSearchTool.execute({}, ctx);
    expect(result.ok).toBe(false);
  });

  it("action:hybrid finds a seeded term and degrades to lexical without an embedder", async () => {
    await writeFile(
      join(tmpHome, "world.jsonl"),
      '{"id":"p1","name":"MegaCorp","type":"company"}\n',
      "utf8",
    );
    const result = await lifeSearchTool.execute({ action: "hybrid", q: "MegaCorp" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("MegaCorp"); // holds whether or not Ollama is present
  });

  it("action:hybrid without q returns ok:false", async () => {
    const result = await lifeSearchTool.execute({ action: "hybrid" }, ctx);
    expect(result.ok).toBe(false);
  });

  it("describeForSafety returns life_search + query", () => {
    const desc = lifeSearchTool.describeForSafety!({ q: "alice" });
    expect(desc).toBe("life_search alice");
  });
});
