import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { skillManageTool } from "./skill-manage.js";
import { listPendingSkillMutations, setSkillWriteApproval } from "../skills/write-approval.js";
import { writeSkill } from "../skills/store.js";
import type { ToolContext } from "./types.js";

let root = "", prior: string | undefined;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); if (prior === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = prior; });

describe("skill_manage", () => {
  it("stages typed agent mutations with the source session", async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-skill-manage-")); prior = process.env.VANTA_HOME; process.env.VANTA_HOME = join(root, "home");
    await setSkillWriteApproval(true, root, process.env);
    await writeSkill({ name: "useful", description: "d", body: "body" }, { env: process.env });
    const result = await skillManageTool.execute({ action: "write_file", slug: "useful", path: "references/api.md", content: "safe" }, { root, sessionId: "session-7" } as ToolContext);
    expect(result).toMatchObject({ ok: true, output: expect.stringContaining("staged write_file") });
    expect((await listPendingSkillMutations(process.env))[0]?.sessionId).toBe("session-7");
  });

  it("returns actionable validation errors", async () => {
    expect((await skillManageTool.execute({ action: "patch", slug: "x" }, { root: process.cwd() } as ToolContext)).output).toContain("oldString");
  });
});
