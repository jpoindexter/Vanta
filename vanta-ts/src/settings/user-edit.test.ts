import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSkillEnabled } from "../skills/enable-state.js";
import { readUserSettingsRaw, updateUserSettings, userSettingsFile } from "./user-edit.js";

let home: string;
let env: NodeJS.ProcessEnv;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-user-settings-recovery-"));
  env = { VANTA_HOME: home };
});
afterEach(async () => rm(home, { recursive: true, force: true }));

describe("user settings edits", () => {
  it("creates missing settings without discarding unrelated valid object keys", async () => {
    expect(await readUserSettingsRaw(env)).toEqual({});
    await updateUserSettings(() => ({ blockedTools: ["shell_cmd"], retained: { custom: true } }), env);
    await setSkillEnabled("synthetic-skill", false, env);
    expect(await readUserSettingsRaw(env)).toEqual({
      blockedTools: ["shell_cmd"], retained: { custom: true },
      skillOverrides: { "synthetic-skill": { disabled: true } },
    });
  });

  it.each(['{"blockedTools":["shell_cmd"],', '[]', 'null', '"text"', '42'])
    ("refuses invalid settings without running the mutation or replacing %s", async (raw) => {
      const path = userSettingsFile(env);
      await writeFile(path, raw, "utf8");
      const mutate = vi.fn(() => ({ ui: { theme: "light" } }));
      await expect(updateUserSettings(mutate, env)).rejects.toThrow(path);
      expect(mutate).not.toHaveBeenCalled();
      await expect(setSkillEnabled("synthetic-skill", false, env)).rejects.toThrow(/recovery/i);
      expect(await readFile(path, "utf8")).toBe(raw);
      expect(await readdir(home)).toEqual(["settings.json"]);
    });

  it("does not convert a non-ENOENT read failure into empty settings", async () => {
    const path = userSettingsFile(env);
    await mkdir(path);
    const mutate = vi.fn(() => ({}));
    await expect(readUserSettingsRaw(env)).rejects.toThrow(path);
    await expect(updateUserSettings(mutate, env)).rejects.toThrow(/recovery/i);
    expect(mutate).not.toHaveBeenCalled();
    expect(await readdir(path)).toEqual([]);
  });
});
