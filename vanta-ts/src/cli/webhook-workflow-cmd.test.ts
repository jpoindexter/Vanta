import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runWebhookCommand } from "./webhook-workflow-cmd.js";
import { findWorkflow, listReceipts } from "../webhook-workflows/store.js";

let dataDir = "";
afterEach(async () => { if (dataDir) await rm(dataDir, { recursive: true, force: true }); });

function deps(lines: string[]) {
  return { log: (line: string) => lines.push(line), now: () => new Date("2026-07-11T12:00:00.000Z"), secret: () => "generated-secret" };
}

describe("vanta webhook workflow", () => {
  it("creates a template workflow and prints its one-time secret, payload, dry-run, and controls", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-webhook-cli-"));
    const lines: string[] = [];
    const code = await runWebhookCommand(dataDir, [
      "workflow", "new", "github-pr", "--id", "review-pr", "--name", "Review PR", "--deliver", "file:reviews.log",
    ], deps(lines));
    const output = lines.join("\n");
    expect(code).toBe(0);
    expect(output).toContain("created review-pr");
    expect(output).toContain("/webhooks/review-pr");
    expect(output).toContain("secret (shown once): generated-secret");
    expect(output).toContain('"pull_request"');
    expect(output).toContain("dry-run: passed");
    expect(output).toContain("vanta webhook workflow enable review-pr");
    expect((await findWorkflow(dataDir, "review-pr"))?.enabled).toBe(false);
  });

  it("lists, shows, tests, enables, and disables workflows without printing secrets again", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-webhook-cli-"));
    const lines: string[] = [];
    await runWebhookCommand(dataDir, ["workflow", "new", "email", "--id", "triage-mail"], deps(lines));
    lines.length = 0;
    expect(await runWebhookCommand(dataDir, ["workflow", "enable", "triage-mail"], deps(lines))).toBe(0);
    expect(await runWebhookCommand(dataDir, ["workflow", "list"], deps(lines))).toBe(0);
    expect(await runWebhookCommand(dataDir, ["workflow", "show", "triage-mail"], deps(lines))).toBe(0);
    expect(await runWebhookCommand(dataDir, ["workflow", "test", "triage-mail"], deps(lines))).toBe(0);
    expect(lines.join("\n")).toContain("enabled");
    expect(lines.join("\n")).toContain("receipts:");
    expect(lines.join("\n")).toContain("dry-run passed");
    expect(lines.join("\n")).not.toContain("generated-secret");
    expect((await listReceipts(dataDir, "triage-mail")).filter((item) => item.phase === "dry-run")).toHaveLength(2);
    expect(await runWebhookCommand(dataDir, ["workflow", "disable", "triage-mail"], deps(lines))).toBe(0);
    expect((await findWorkflow(dataDir, "triage-mail"))?.enabled).toBe(false);
  });

  it("returns actionable errors for bad syntax, unknown templates, and missing ids", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-webhook-cli-"));
    const lines: string[] = [];
    expect(await runWebhookCommand(dataDir, [], deps(lines))).toBe(1);
    expect(await runWebhookCommand(dataDir, ["workflow", "new", "unknown"], deps(lines))).toBe(1);
    expect(await runWebhookCommand(dataDir, ["workflow", "enable", "missing"], deps(lines))).toBe(1);
    expect(lines.join("\n")).toContain("github-pr | email | subscriber | generic");
    expect(lines.join("\n")).toContain("workflow not found");
  });

  it("accepts a registered channel target without requiring the live sender during creation", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-webhook-cli-"));
    const lines: string[] = [];
    expect(await runWebhookCommand(dataDir, ["workflow", "new", "generic", "--id", "notify", "--deliver", "telegram:42"], deps(lines))).toBe(0);
    expect((await findWorkflow(dataDir, "notify"))?.deliver).toBe("telegram:42");
  });
});
