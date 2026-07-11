import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillsApprovalCommand } from "./skills-approval-cmd.js";
import { listPendingSkillMutations, setSkillWriteApproval, submitAgentSkillMutation } from "../skills/write-approval.js";
import { readSkill } from "../skills/store.js";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe("skills approval CLI", () => {
  it("lists, diffs, approves, rejects, and toggles the queue", async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-skill-approval-cli-")); const env = { VANTA_HOME: join(root, "home") }, lines: string[] = [];
    const deps = { root, env, log: (line: string) => lines.push(line) }; await setSkillWriteApproval(true, root, env);
    const first = await submitAgentSkillMutation({ action: "create", input: { name: "first", description: "d", body: "line one" } }, { root, env, reason: "test", now: new Date("2026-07-11T12:00:00Z") });
    expect(await runSkillsApprovalCommand(["pending"], deps)).toBe(0);
    expect(await runSkillsApprovalCommand(["diff", first.id], deps)).toBe(0);
    expect(lines.join("\n")).toContain("+line one");
    expect(await runSkillsApprovalCommand(["approve", first.id], deps)).toBe(0);
    expect(await readSkill("first", env)).not.toBeNull();
    const second = await submitAgentSkillMutation({ action: "edit", input: { name: "first", description: "d", body: "line two" } }, { root, env, reason: "test", now: new Date("2026-07-11T12:01:00Z") });
    expect(await runSkillsApprovalCommand(["reject", second.id, "not", "needed"], deps)).toBe(0);
    expect(await listPendingSkillMutations(env)).toEqual([]);
    expect(await runSkillsApprovalCommand(["approval", "off"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("skill write approval: off");
  });
});
