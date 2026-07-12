import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCorpusCommand } from "./corpus-cmd.js";

let root: string;
let lines: string[];

beforeEach(async () => {
  root = join(tmpdir(), `vanta-corpus-cli-${Date.now()}-${Math.random()}`);
  lines = [];
  await mkdir(root, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("vanta corpus", () => {
  it("ingests, recalls, reports status, refreshes, and exports", async () => {
    const file = join(root, "atlas.md");
    const vault = join(root, "vault");
    await writeFile(file, "Caroline approved the Atlas receipt.");
    const deps = { env: { VANTA_HOME: join(root, "home") }, log: (line: string) => lines.push(line), embedder: async () => null };

    expect(await runCorpusCommand(["ingest", file], deps)).toBe(0);
    expect(lines.join("\n")).toContain("Imported 1 source");
    lines = [];
    expect(await runCorpusCommand(["recall", "Caroline Atlas"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("source:");
    expect(lines.join("\n")).toContain("freshness: fresh");
    lines = [];
    expect(await runCorpusCommand(["status"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("1 source");
    lines = [];
    expect(await runCorpusCommand(["refresh", "all"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("Refreshed 1 source");
    lines = [];
    expect(await runCorpusCommand(["vault-export", "--vault", vault, "--apply"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("Applied");
  });

  it("returns usage for an incomplete command", async () => {
    const code = await runCorpusCommand(["ingest"], { env: { VANTA_HOME: root }, log: (line) => lines.push(line) });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("Usage: vanta corpus");
  });

  it("resolves relative ingest targets from the canonical project root", async () => {
    const nested = join(root, "receipts");
    await mkdir(nested);
    await writeFile(join(nested, "proof.txt"), "VANTA_RELATIVE_CORPUS_OK");
    const deps = { root, env: { VANTA_HOME: join(root, "home") }, log: (line: string) => lines.push(line), embedder: async () => null };

    expect(await runCorpusCommand(["ingest", "receipts"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("Imported 1 source");
  });
});
