import { describe, it, expect } from "vitest";
import { detectStack, repoEntity, scanSystemMap, formatSystemMap, type ScanDeps } from "./system-map.js";

// WORLD-MODEL (first slice) — repo stack detection + system map.

describe("detectStack", () => {
  it("detects single-stack repos from marker files", () => {
    expect(detectStack(["Cargo.toml", "src"])).toEqual(["Rust"]);
    expect(detectStack(["go.mod", "main.go"])).toEqual(["Go"]);
    expect(detectStack(["pyproject.toml"])).toEqual(["Python"]);
  });
  it("prefers TypeScript over bare Node when both markers present", () => {
    expect(detectStack(["package.json", "tsconfig.json"])).toEqual(["TypeScript"]);
  });
  it("detects a multi-stack repo (Rust + TypeScript, like Vanta)", () => {
    const s = detectStack(["Cargo.toml", "package.json", "tsconfig.json"]);
    expect(s).toContain("Rust");
    expect(s).toContain("TypeScript");
    expect(s).not.toContain("Node");
  });
  it("returns [] for an unknown stack", () => {
    expect(detectStack(["README.md", "notes.txt"])).toEqual([]);
  });
});

describe("repoEntity", () => {
  it("builds a repo world-entity with stack + git state in the note", () => {
    const e = repoEntity({ name: "vanta", files: ["Cargo.toml", "tsconfig.json"], branch: "main", lastCommit: "ship it" }, "T");
    expect(e).toMatchObject({ kind: "entity", type: "repo", id: "repo:vanta", name: "vanta" });
    expect(e.note).toContain("Rust + TypeScript");
    expect(e.note).toContain("main: ship it");
  });
  it("notes missing git state + unknown stack gracefully", () => {
    const e = repoEntity({ name: "x", files: [], branch: null, lastCommit: null }, "T");
    expect(e.note).toContain("unknown stack");
    expect(e.note).toContain("no git state");
  });
});

describe("scanSystemMap", () => {
  const deps: ScanDeps = {
    listRepos: async () => ["alpha", "beta"],
    listFiles: async (r) => (r === "alpha" ? ["Cargo.toml"] : ["package.json", "tsconfig.json"]),
    gitState: async (r) => ({ branch: r === "alpha" ? "main" : "dev", lastCommit: "wip" }),
  };

  it("scans every repo into entities via injected I/O", async () => {
    const map = await scanSystemMap(deps, "T");
    expect(map.map((e) => e.name)).toEqual(["alpha", "beta"]);
    expect(map[0]!.note).toContain("Rust — main: wip");
    expect(map[1]!.note).toContain("TypeScript — dev: wip");
  });

  it("a failing per-repo read degrades to empty stack / no git (never throws)", async () => {
    const flaky: ScanDeps = {
      listRepos: async () => ["boom"],
      listFiles: async () => { throw new Error("io"); },
      gitState: async () => { throw new Error("io"); },
    };
    const map = await scanSystemMap(flaky, "T");
    expect(map).toHaveLength(1);
    expect(map[0]!.note).toContain("unknown stack");
  });
});

describe("formatSystemMap", () => {
  it("renders a row per repo, or an empty-state line", () => {
    const out = formatSystemMap([repoEntity({ name: "a", files: ["go.mod"], branch: "main", lastCommit: "x" }, "T")]);
    expect(out).toContain("System map — 1 repo");
    expect(out).toContain("Go — main: x");
    expect(formatSystemMap([])).toContain("No repos found");
  });
});
