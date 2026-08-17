import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runOperatorSpineCommand } from "./operator-spine-cmd.js";

it("prints the same read-only reconciliation used by Desktop", async () => {
  const root = await mkdtemp(join(tmpdir(), "vanta-operator-cli-"));
  const home = await mkdtemp(join(tmpdir(), "vanta-operator-home-"));
  await mkdir(join(root, ".vanta"), { recursive: true });
  await writeFile(join(root, ".vanta", "tickets.json"), JSON.stringify({ version: 1, tickets: [{
    id: "ticket-1", title: "Continue OP-01", status: "open", inbox: "unread", links: {}, labels: [], comments: [], attachments: [],
    createdAt: "2026-08-04T10:00:00.000Z", updatedAt: "2026-08-04T10:00:00.000Z",
  }] }));
  const lines: string[] = [];
  const code = await runOperatorSpineCommand(root, {
    env: { ...process.env, VANTA_HOME: home }, now: new Date("2026-08-04T10:00:00.000Z"), log: (line) => lines.push(line),
  });
  expect(code).toBe(0);
  expect(lines.join("\n")).toContain("Operator spine: OK (read-only)");
  expect(lines.join("\n")).toContain("ticket 1/1 ok");
});

describe("degraded operator spine", () => {
  it("returns a nonzero diagnostic exit without changing the source", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-operator-cli-"));
    const home = await mkdtemp(join(tmpdir(), "vanta-operator-home-"));
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(join(root, ".vanta", "tickets.json"), "{broken");
    const lines: string[] = [];
    const code = await runOperatorSpineCommand(root, { env: { ...process.env, VANTA_HOME: home }, log: (line) => lines.push(line) });
    expect(code).toBe(2);
    expect(lines.join("\n")).toContain("DEGRADED");
  });
});
