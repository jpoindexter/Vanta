import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setSkillWriteApproval, skillWriteApprovalEnabled } from "./write-approval.js";

let fixture: string;
let root: string;
let home: string;
let env: NodeJS.ProcessEnv;
beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), "vanta-skill-approval-settings-"));
  root = join(fixture, "project"); home = join(fixture, "home");
  await mkdir(join(root, ".vanta"), { recursive: true }); await mkdir(home);
  env = { VANTA_HOME: home };
});
afterEach(async () => rm(fixture, { recursive: true, force: true }));

describe("skill approval settings preservation", () => {
  it.each(["user", "project", "local"])("rejects corrupt %s policy before writing any user setting", async (scope) => {
    const user = join(home, "settings.json");
    await writeFile(user, '{"blockedTools":["shell_cmd"],"skills":{"writeApproval":false}}');
    const path = scope === "user" ? user : join(root, ".vanta", scope === "project" ? "settings.json" : "settings.local.json");
    await writeFile(path, '{"blockedTools":["shell_cmd"],');
    const userBefore = await readFile(user, "utf8"), suspectBefore = await readFile(path, "utf8");
    await expect(setSkillWriteApproval(true, root, env)).rejects.toThrow(path);
    expect(await readFile(user, "utf8")).toBe(userBefore);
    expect(await readFile(path, "utf8")).toBe(suspectBefore);
  });

  it.each(['[]', 'null', '{"blockedTools":false}', '{"skills":{"writeApproval":"bad"}}'])
    ("preserves nonobject or invalid recognized policy %s", async (raw) => {
      const path = join(home, "settings.json"); await writeFile(path, raw);
      await expect(setSkillWriteApproval(true, root, env)).rejects.toThrow(path);
      expect(await readFile(path, "utf8")).toBe(raw);
    });

  it("preserves valid unknown keys and sibling skill settings", async () => {
    const path = join(home, "settings.json");
    const settings = { blockedTools: ["shell_cmd"], futurePreference: { retained: true }, skills: { maxSkills: 4, writeApproval: false } };
    await writeFile(path, JSON.stringify(settings));
    await setSkillWriteApproval(true, root, env);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ ...settings, skills: { maxSkills: 4, writeApproval: true } });
    expect(await skillWriteApprovalEnabled(root, env)).toBe(true);
  });

  it("keeps missing-file defaults and explicit on/off behavior", async () => {
    expect(await skillWriteApprovalEnabled(root, env)).toBe(false);
    await setSkillWriteApproval(true, root, env);
    expect(await skillWriteApprovalEnabled(root, env)).toBe(true);
    expect((await stat(join(home, "settings.json"))).mode & 0o777).toBe(0o600);
    await setSkillWriteApproval(false, root, env);
    expect(await skillWriteApprovalEnabled(root, env)).toBe(false);
  });
});
