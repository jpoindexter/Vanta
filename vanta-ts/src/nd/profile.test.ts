import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadNdConfig, saveNdConfig, ndEngineEnabled, ndProfilePath, isGateId } from "./profile.js";
import { defaultNdConfig, setGateEnabled } from "./engine.js";

async function tempHome(): Promise<{ env: NodeJS.ProcessEnv; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "vanta-nd-"));
  return { env: { VANTA_HOME: dir } as NodeJS.ProcessEnv, dir };
}

describe("nd profile", () => {
  it("defaults when no file exists", async () => {
    const { env, dir } = await tempHome();
    try {
      expect(await loadNdConfig(env)).toEqual(defaultNdConfig());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("round-trips a saved config", async () => {
    const { env, dir } = await tempHome();
    try {
      const cfg = setGateEnabled(defaultNdConfig(), "research", false);
      await saveNdConfig(cfg, env);
      expect((await loadNdConfig(env)).research.enabled).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("merges a partial profile over defaults (new gates keep their default)", async () => {
    const { env, dir } = await tempHome();
    try {
      await writeFile(ndProfilePath(env), JSON.stringify({ inhibit: { enabled: false } }), "utf8");
      const cfg = await loadNdConfig(env);
      expect(cfg.inhibit.enabled).toBe(false); // from file
      expect(cfg.research.enabled).toBe(true); // default preserved
      expect(typeof cfg.research.threshold).toBe("number");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("master switch reads VANTA_ND", () => {
    expect(ndEngineEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(ndEngineEnabled({ VANTA_ND: "off" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("isGateId validates", () => {
    expect(isGateId("research")).toBe(true);
    expect(isGateId("nope")).toBe(false);
  });
});
