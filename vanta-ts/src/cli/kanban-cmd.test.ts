import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runKanbanCommand } from "./kanban-cmd.js";

let tmp: string | null = null;

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("runKanbanCommand", () => {
  it("creates, swarms, and resumes the latest kanban board", async () => {
    tmp = await mkdtemp(join(tmpdir(), "vanta-kanban-cli-"));
    const lines: string[] = [];

    expect(await runKanbanCommand(tmp, ["create", "ship", "roadmap", "card"], (line) => lines.push(line))).toBe(0);
    expect(lines.join("\n")).toContain("goal ship roadmap card");

    lines.length = 0;
    expect(await runKanbanCommand(tmp, ["swarm"], (line) => lines.push(line))).toBe(0);
    expect(lines.join("\n")).toContain("5 done");

    lines.length = 0;
    expect(await runKanbanCommand(tmp, ["status"], (line) => lines.push(line))).toBe(0);
    expect(lines.join("\n")).toContain("done");
  });
});
