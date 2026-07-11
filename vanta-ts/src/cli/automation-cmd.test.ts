import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAutomationCommand } from "./automation-cmd.js";
import { listAutomations } from "../automation-blueprints/runtime.js";

let dataDir = "";
afterEach(async () => { if (dataDir) await rm(dataDir, { recursive: true, force: true }); });

function deps(lines: string[]) {
  return { log: (line: string) => lines.push(line), now: () => new Date("2026-07-11T12:00:00Z"), env: process.env };
}

describe("vanta automation", () => {
  it("lists schedule and webhook blueprints", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-auto-cli-"));
    const lines: string[] = [];
    expect(await runAutomationCommand(dataDir, ["blueprints"], deps(lines))).toBe(0);
    expect(lines.join("\n")).toContain("daily-brief\tschedule");
    expect(lines.join("\n")).toContain("github-pr-review\twebhook");
  });

  it("previews first and refuses to create without --yes", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-auto-cli-"));
    const lines: string[] = [];
    expect(await runAutomationCommand(dataDir, ["preview", "daily-brief", "topic=roadmap"], deps(lines))).toBe(0);
    expect(lines.join("\n")).toContain("Preview daily-brief");
    expect(lines.join("\n")).toContain("apply daily-brief topic=roadmap --yes");
    expect(await runAutomationCommand(dataDir, ["apply", "daily-brief", "topic=roadmap"], deps(lines))).toBe(1);
    expect(await listAutomations(dataDir)).toHaveLength(0);
  });

  it("creates and controls an automation with receipt links", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-auto-cli-"));
    const lines: string[] = [];
    expect(await runAutomationCommand(dataDir, ["apply", "daily-brief", "topic=roadmap", "--yes"], deps(lines))).toBe(0);
    const id = (await listAutomations(dataDir))[0]!.id;
    expect(await runAutomationCommand(dataDir, ["pause", id], deps(lines))).toBe(0);
    expect(await runAutomationCommand(dataDir, ["resume", id], deps(lines))).toBe(0);
    expect(await runAutomationCommand(dataDir, ["test", id], deps(lines))).toBe(0);
    expect(await runAutomationCommand(dataDir, ["receipts", id], deps(lines))).toBe(0);
    expect(lines.join("\n")).toContain(`vanta automation receipts ${id}`);
    expect(lines.join("\n")).toContain("tested\tpassed");
  });
});
