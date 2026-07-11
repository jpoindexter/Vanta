import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHomeCommand } from "./home-cmd.js";
import { createProfile, switchProfile, targetProfile } from "../profiles/store.js";
import { decomposeGoal } from "../kanban/kanban.js";
import { addRoutedLane, claimRoutedLane } from "../kanban/router.js";
import { saveKanbanBoard } from "../kanban/store.js";

let root: string;
let home: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-home-cmd-root-"));
  home = await mkdtemp(join(tmpdir(), "vanta-home-cmd-home-"));
});

afterEach(async () => {
  await Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(home, { recursive: true, force: true }),
  ]);
});

describe("runHomeCommand", () => {
  it("prints the operator home from an isolated store", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg = "") => { lines.push(String(msg)); });
    try {
      const code = await runHomeCommand(join(root, ".vanta"), { ...process.env, VANTA_HOME: home });
      const out = lines.join("\n");
      expect(code).toBe(0);
      expect(out).toContain("Operator Home");
      expect(out).toContain("Workflows");
      expect(out).toContain("Channels");
      expect(out).toContain("Agents/Tasks");
      expect(out).toContain("Profiles");
      expect(out).toContain("Watchers");
      expect(out).toContain("Setup");
    } finally {
      spy.mockRestore();
    }
  });

  it("shows the active profile roster and latest targeted work", async () => {
    const env = { ...process.env, VANTA_HOME: home };
    await createProfile({ name: "Research Lead", model: "gpt-5.5" }, env);
    await targetProfile("research-lead", "Audit provider fallback", env);
    await switchProfile("research-lead", env);
    const base = decomposeGoal("route work");
    const added = addRoutedLane(base, { id: "research", title: "Research", instruction: "Research", requiredSkills: [], wakePolicy: "manual" });
    saveKanbanBoard(root, claimRoutedLane(added, "research", { id: "research-lead", skills: [] }));
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg = "") => { lines.push(String(msg)); });
    try {
      expect(await runHomeCommand(join(root, ".vanta"), env)).toBe(0);
      const out = lines.join("\n");
      expect(out).toContain("1 profile(s), 1 active, 1 queued");
      expect(out).toContain("research-lead: Audit provider fallback");
      expect(out).toContain("`vanta profiles list`");
      expect(out).toContain("Kanban");
      expect(out).toContain("1 active lane(s), 0 blocked");
      expect(out).toContain("research: research-lead");
      expect(out).toContain("`vanta kanban status`");
    } finally {
      spy.mockRestore();
    }
  });
});
