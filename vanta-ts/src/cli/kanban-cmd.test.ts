import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runKanbanCommand } from "./kanban-cmd.js";
import { createProfile } from "../profiles/store.js";
import { decomposeGoal } from "../kanban/kanban.js";
import { saveKanbanBoard } from "../kanban/store.js";

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

  it("honors the positional board id advertised by status", async () => {
    tmp = await mkdtemp(join(tmpdir(), "vanta-kanban-cli-"));
    const first = decomposeGoal("first exact board", {
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });
    const second = decomposeGoal("newer default board", {
      now: () => new Date("2026-07-10T00:00:00.000Z"),
    });
    saveKanbanBoard(tmp, first);
    saveKanbanBoard(tmp, second);
    const lines: string[] = [];

    expect(await runKanbanCommand(tmp, ["status", first.id], (line) => lines.push(line))).toBe(0);
    expect(lines.join("\n")).toContain("goal first exact board");
    expect(lines.join("\n")).not.toContain("goal newer default board");
  });

  it("routes durable cards through capable profiles and receipt-gated transitions", async () => {
    tmp = await mkdtemp(join(tmpdir(), "vanta-kanban-router-cli-"));
    const home = join(tmp, "home");
    const env = { VANTA_HOME: home };
    const research = await createProfile({ name: "Research Lead" }, env);
    await mkdir(join(research.home, "skills", "research"), { recursive: true });
    await createProfile({ name: "Research Backup" }, env);
    const lines: string[] = [];
    const run = (args: string[]) => runKanbanCommand(tmp as string, args, (line) => lines.push(line), env);

    expect(await run(["create", "route", "research"])).toBe(0);
    lines.length = 0;
    expect(await run(["add", "research", "Research sources", "--instruction", "Find primary evidence", "--skills", "research", "--wake", "immediate", "--fallback", "research-backup"])).toBe(0);
    expect(await run(["route", "research"])).toBe(0);
    expect(lines.join("\n")).toContain("owner: research-lead");
    lines.length = 0;
    expect(await run(["handoff", "research", "research-backup", "--reason", "primary unavailable"])).toBe(0);
    expect(await run(["update", "research", "blocked", "--detail", "provider timeout"])).toBe(0);
    expect(await run(["retry", "research"])).toBe(0);
    expect(await run(["update", "research", "done", "--detail", "finished", "--evidence", "receipts/research.json"])).toBe(0);
    lines.length = 0;
    expect(await run(["status"])).toBe(0);
    expect(lines.join("\n")).toContain("research   done");
    expect(lines.join("\n")).toContain("evidence: receipts/research.json");
  });
});
