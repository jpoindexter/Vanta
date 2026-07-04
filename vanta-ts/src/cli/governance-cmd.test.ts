import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGovernanceCommand } from "./governance-cmd.js";

function gateLine(ts: number, resolution: string, risk = "allow"): string {
  const event = JSON.stringify({ kind: "gate", tool: "shell_cmd", action: "run ls", risk, resolution });
  return JSON.stringify({ ts, event });
}

describe("runGovernanceCommand (PAPER-GOVERNANCE-AUDIT)", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-governance-cmd-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("prints usage and exits 1 with no subcommand", async () => {
    const code = await runGovernanceCommand(root, []);
    expect(code).toBe(1);
  });

  it("prints usage (exit 0) for an unrecognized subcommand", async () => {
    const code = await runGovernanceCommand(root, ["bogus"]);
    expect(code).toBe(0);
  });

  it("exports a report from an EMPTY/missing events.jsonl (no gated actions yet)", async () => {
    const code = await runGovernanceCommand(root, ["export"]);
    expect(code).toBe(0);
    const written = await readFile(join(root, ".vanta", "governance-audit.md"), "utf8");
    expect(written).toContain("**Total gated actions:** 0");
  });

  it("exports a real report over a seeded events.jsonl, defaulting the output path", async () => {
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(
      join(root, ".vanta", "events.jsonl"),
      [gateLine(1_700_000_000, "allow"), gateLine(1_700_000_100, "blocked", "block")].join("\n"),
      "utf8",
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = await runGovernanceCommand(root, ["export"]);
      expect(code).toBe(0);
    } finally {
      logSpy.mockRestore();
    }
    const written = await readFile(join(root, ".vanta", "governance-audit.md"), "utf8");
    expect(written).toContain("**Total gated actions:** 2");
    expect(written).toContain("| blocked | 1 |");
  });

  it("honors --out to write the report to a custom path", async () => {
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(join(root, ".vanta", "events.jsonl"), gateLine(1_700_000_000, "allow"), "utf8");
    const outPath = join(root, "custom-audit.md");
    const code = await runGovernanceCommand(root, ["export", "--out", outPath]);
    expect(code).toBe(0);
    expect(await readFile(outPath, "utf8")).toContain("**Total gated actions:** 1");
  });

  it("honors --since to scope the export to a cutoff date", async () => {
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(
      join(root, ".vanta", "events.jsonl"),
      [gateLine(1_700_000_000, "allow"), gateLine(1_750_000_000, "approved", "ask")].join("\n"),
      "utf8",
    );
    const code = await runGovernanceCommand(root, ["export", "--since", "2025-06-01"]);
    expect(code).toBe(0);
    const written = await readFile(join(root, ".vanta", "governance-audit.md"), "utf8");
    expect(written).toContain("**Total gated actions:** 1"); // only the later event survives the cutoff
  });

  it("rejects an unparseable --since date", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const code = await runGovernanceCommand(root, ["export", "--since", "not-a-date"]);
      expect(code).toBe(1);
    } finally {
      errSpy.mockRestore();
    }
  });
});
