import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { searchBlobs, gatherLifeBlobs } from "./life.js";

// --- searchBlobs (pure) ---

describe("searchBlobs", () => {
  const blobs = [
    { source: "world", text: "Alice is a person\nBob works at Acme\nCarol manages finances" },
    { source: "money", text: "invoice: $100\nPayment pending for Acme\nalice expense" },
  ];

  it("matches lines case-insensitively", () => {
    const hits = searchBlobs(blobs, "acme");
    expect(hits).toHaveLength(2);
    expect(hits.at(0)).toEqual({ source: "world", line: 2, snippet: "Bob works at Acme" });
    expect(hits.at(1)).toEqual({ source: "money", line: 2, snippet: "Payment pending for Acme" });
  });

  it("matches lines with uppercase query", () => {
    const hits = searchBlobs(blobs, "ALICE");
    expect(hits).toHaveLength(2);
    expect(hits.at(0)?.source).toBe("world");
    expect(hits.at(1)?.source).toBe("money");
  });

  it("caps at max", () => {
    const hits = searchBlobs(blobs, "a", 2);
    expect(hits).toHaveLength(2);
  });

  it("uses default max of 12", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      source: "s",
      text: Array.from({ length: 20 }, (__, j) => `line ${i}-${j} matching`).join("\n"),
    }));
    const hits = searchBlobs(many, "matching");
    expect(hits.length).toBeLessThanOrEqual(12);
  });

  it("returns [] for empty q", () => {
    expect(searchBlobs(blobs, "")).toEqual([]);
  });

  it("returns [] when nothing matches", () => {
    expect(searchBlobs(blobs, "zzznomatch")).toEqual([]);
  });

  it("clips long lines to 120 chars with ellipsis", () => {
    const long = "x".repeat(200) + " needle " + "y".repeat(200);
    const b = [{ source: "s", text: long }];
    const hits = searchBlobs(b, "needle");
    const first = hits.at(0);
    if (!first) throw new Error("expected a hit");
    expect(first.snippet.length).toBeLessThanOrEqual(121); // 120 + "…"
    expect(first.snippet).toMatch(/…$/);
  });

  it("matches a natural-language query against significant terms and reports line numbers", () => {
    const hits = searchBlobs(
      [
        {
          source: "repo",
          path: "notes/operator.md",
          text: "intro\nOperator aesthetics should make status visible.\nclosing",
        },
      ],
      "where did I write about operator aesthetics",
    );
    expect(hits.at(0)).toEqual({
      source: "repo",
      path: "notes/operator.md",
      line: 2,
      snippet: "Operator aesthetics should make status visible.",
    });
  });

  it("does not treat write-about wrapper words as content terms", () => {
    const hits = searchBlobs(
      [{ source: "repo", path: "notes/operator.md", text: "The operator may write an approval note.\n" }],
      "where did I write about operator aesthetics",
    );
    expect(hits).toEqual([]);
  });
});

// --- gatherLifeBlobs (IO) ---

describe("gatherLifeBlobs", () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await mkdtemp(join(tmpdir(), "vanta-life-test-"));
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns a world blob from seeded world.jsonl", async () => {
    await writeFile(join(tmpHome, "world.jsonl"), '{"id":"p1","name":"Alice"}\n', "utf8");
    const blobs = await gatherLifeBlobs({ VANTA_HOME: tmpHome }, "/nonexistent-repo");
    const world = blobs.find((b) => b.source === "world");
    if (!world) throw new Error("world blob missing");
    expect(world.text).toContain("Alice");
  });

  it("skips missing stores without throwing", async () => {
    const blobs = await gatherLifeBlobs({ VANTA_HOME: tmpHome }, "/nonexistent-repo");
    expect(Array.isArray(blobs)).toBe(true);
    expect(blobs.every((b) => typeof b.source === "string" && typeof b.text === "string")).toBe(true);
  });

  it("includes errors blob when ERRORS.md exists", async () => {
    const fakeRepo = await mkdtemp(join(tmpdir(), "vanta-life-repo-"));
    try {
      await writeFile(join(fakeRepo, "ERRORS.md"), "## 2026-01-01 — crash\nWhat failed\n", "utf8");
      const blobs = await gatherLifeBlobs({ VANTA_HOME: tmpHome }, fakeRepo);
      const err = blobs.find((b) => b.source === "errors");
      if (!err) throw new Error("errors blob missing");
      expect(err.text).toContain("crash");
    } finally {
      rmSync(fakeRepo, { recursive: true, force: true });
    }
  });

  it("includes repo and brain files as source-cited blobs", async () => {
    const fakeRepo = await mkdtemp(join(tmpdir(), "vanta-life-repo-"));
    try {
      await mkdir(join(fakeRepo, "notes"), { recursive: true });
      await mkdir(join(fakeRepo, "node_modules"), { recursive: true });
      await mkdir(join(tmpHome, "brain"), { recursive: true });
      await writeFile(
        join(fakeRepo, "notes", "operator.md"),
        "Title\nOperator aesthetics belong in the launch pad.\n",
        "utf8",
      );
      await writeFile(
        join(fakeRepo, "node_modules", "ignored.md"),
        "operator aesthetics from dependency noise\n",
        "utf8",
      );
      await writeFile(
        join(tmpHome, "brain", "semantic.md"),
        "Remember: operator aesthetics means source-cited control.\n",
        "utf8",
      );

      const blobs = await gatherLifeBlobs({ VANTA_HOME: tmpHome }, fakeRepo);
      const hits = searchBlobs(blobs, "where did I write about operator aesthetics", 20);

      expect(hits.some((h) => h.source === "repo" && h.path === "notes/operator.md" && h.line === 2)).toBe(true);
      expect(hits.some((h) => h.source === "brain" && h.path?.endsWith("brain/semantic.md") && h.line === 1)).toBe(true);
      expect(hits.some((h) => h.path?.includes("node_modules"))).toBe(false);
    } finally {
      rmSync(fakeRepo, { recursive: true, force: true });
    }
  });
});
