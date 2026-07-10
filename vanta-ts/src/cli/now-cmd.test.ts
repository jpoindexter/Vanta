import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runNowCommand } from "./now-cmd.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(items: unknown[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-now-cmd-"));
  roots.push(root);
  await writeFile(join(root, "roadmap.json"), JSON.stringify({ updated: "2026-01-01", items }, null, 2), "utf8");
  return root;
}

function card(id: string, status: string, tier = "rock", size = "S") {
  return { id, track: "Operator", title: `Title ${id}`, status, size, summary: "s", done: "d", tier };
}

describe("runNowCommand", () => {
  it("proposes the best next cards without moving them by default", async () => {
    const root = await workspace([card("B", "next", "sand"), card("A", "next", "rock")]);
    const lines: string[] = [];
    await runNowCommand(root, [], { log: (line) => lines.push(line), confirm: async () => false });
    expect(lines.join("\n")).toContain("Move to Now: A");
    const data = JSON.parse(await readFile(join(root, "roadmap.json"), "utf8"));
    expect(data.items.find((i: { id: string }) => i.id === "A").status).toBe("next");
  });

  it("moves proposals to building with --apply and respects WIP capacity", async () => {
    const root = await workspace([card("A", "building"), card("B", "next", "rock"), card("C", "next", "sand")]);
    const lines: string[] = [];
    await runNowCommand(root, ["--apply"], { log: (line) => lines.push(line) });
    const data = JSON.parse(await readFile(join(root, "roadmap.json"), "utf8"));
    expect(data.items.find((i: { id: string }) => i.id === "B").status).toBe("building");
    expect(data.items.find((i: { id: string }) => i.id === "C").status).toBe("next");
    expect(lines.join("\n")).toContain("moved B -> building");
  });

  it("prints blockers and decision work when there are no next cards", async () => {
    const root = await workspace([card("A", "blocked"), card("B", "horizon")]);
    const lines: string[] = [];
    await runNowCommand(root, ["--apply"], { log: (line) => lines.push(line) });
    expect(lines.join("\n")).toContain("nothing to propose");
    expect(lines.join("\n")).toContain("blocked: 1");
    expect(lines.join("\n")).toContain("needs decision: 1");
  });
});
