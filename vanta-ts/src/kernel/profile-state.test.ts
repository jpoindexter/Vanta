import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareProfileKernelState, profileKernelState } from "./profile-state.js";

let base: string;
let root: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "vanta-profile-state-")));
  root = join(base, "project");
  mkdirSync(root);
  const home = join(base, "profiles", "writer");
  mkdirSync(home, { recursive: true });
  env = { VANTA_PROFILE: "writer", VANTA_HOME: home, VANTA_PROFILE_BASE_HOME: base };
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe("profile kernel state", () => {
  it("derives stable per-profile/per-project private state without changing project scope", () => {
    const state = profileKernelState(root, env)!;
    expect(state.owner).toBe("writer");
    expect(state.directory.startsWith(join(env.VANTA_HOME!, "kernel-state") + "/")).toBe(true);
    expect(profileKernelState(root, env)).toEqual(state);
    prepareProfileKernelState(state);
    expect(statSync(state.directory).mode & 0o777).toBe(0o700);
    expect(readFileSync(join(state.directory, "..", ".gitignore"), "utf8")).toBe("*\n");
    chmodSync(state.directory, 0o755);
    prepareProfileKernelState(state);
    expect(statSync(state.directory).mode & 0o777).toBe(0o700);
    expect(profileKernelState(root, { VANTA_PROFILE: "default" })).toBeUndefined();
    expect(profileKernelState(root, {})).toBeUndefined();
  });

  it("refuses forged owner homes, traversal, state symlinks and unsafe ignore files", () => {
    for (const override of [{ VANTA_PROFILE: "../writer" }, { VANTA_HOME: base }, { VANTA_PROFILE_BASE_HOME: "relative" }]) {
      expect(() => profileKernelState(root, { ...env, ...override })).toThrow();
    }
    const state = profileKernelState(root, env)!;
    symlinkSync(root, join(env.VANTA_HOME!, "kernel-state"));
    expect(() => prepareProfileKernelState(state)).toThrow();
    rmSync(join(env.VANTA_HOME!, "kernel-state"));
    prepareProfileKernelState(state);
    writeFileSync(join(state.directory, "..", ".gitignore"), "");
    expect(() => prepareProfileKernelState(state)).toThrow(/versioning/);
  });
});
