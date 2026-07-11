import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HANDLERS } from "./handlers.js";
import { setSkillWriteApproval, submitAgentSkillMutation } from "../skills/write-approval.js";
import type { ReplCtx } from "./types.js";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe("/skills approval review", () => {
  it("shows a gateway-safe truncated diff while preserving the proposal", async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-repl-skill-approval-")); const env = { VANTA_HOME: join(root, "home") }, dataDir = join(root, "project/.vanta");
    await setSkillWriteApproval(true, join(root, "project"), env);
    const record = await submitAgentSkillMutation({ action: "create", input: { name: "long", description: "d", body: "line\n".repeat(1000) } }, { root: join(root, "project"), env, reason: "test" });
    const result = await HANDLERS.skills!("diff " + record.id, { dataDir, env } as unknown as ReplCtx);
    expect(result.output).toContain("truncated");
    expect(result.output!.length).toBeLessThan(2000);
  });
});
