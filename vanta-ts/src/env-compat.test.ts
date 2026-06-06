import { describe, it, expect } from "vitest";
import { mirrorLegacyEnv } from "./env-compat.js";

describe("mirrorLegacyEnv", () => {
  it("mirrors a legacy ARGO_* var onto its VANTA_* equivalent", () => {
    const env = { ARGO_PROVIDER: "codex" } as NodeJS.ProcessEnv;
    mirrorLegacyEnv(env);
    expect(env.VANTA_PROVIDER).toBe("codex");
    expect(env.ARGO_PROVIDER).toBe("codex"); // legacy left intact
  });

  it("does not overwrite an explicit VANTA_* (new name wins)", () => {
    const env = { ARGO_MODEL: "old", VANTA_MODEL: "new" } as NodeJS.ProcessEnv;
    mirrorLegacyEnv(env);
    expect(env.VANTA_MODEL).toBe("new");
  });

  it("ignores non-ARGO_ keys", () => {
    const env = { PATH: "/bin", HOME: "/u" } as NodeJS.ProcessEnv;
    mirrorLegacyEnv(env);
    expect(Object.keys(env).sort()).toEqual(["HOME", "PATH"]);
  });

  it("mirrors several vars at once", () => {
    const env = { ARGO_HOME: "/h", ARGO_KERNEL_URL: "http://x", ARGO_MAX_ITER: "9" } as NodeJS.ProcessEnv;
    mirrorLegacyEnv(env);
    expect(env.VANTA_HOME).toBe("/h");
    expect(env.VANTA_KERNEL_URL).toBe("http://x");
    expect(env.VANTA_MAX_ITER).toBe("9");
  });
});
