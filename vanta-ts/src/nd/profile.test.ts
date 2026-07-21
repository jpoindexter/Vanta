import { describe, it, expect } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadNdConfig,
  saveNdConfig,
  loadNdProfile,
  saveNdProfile,
  saveNdPreferences,
  getOutputDensity,
  invalidateNdConfig,
  ndEngineEnabled,
  ndProfilePath,
  isGateId,
} from "./profile.js";
import {
  defaultNdConfig,
  defaultNdPreferences,
  defaultNdProfile,
  setGateEnabled,
  setNdPreference,
} from "./engine.js";

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

describe("nd profile — preferences", () => {
  it("defaults the preferences when no file exists", async () => {
    const { env, dir } = await tempHome();
    try {
      expect((await loadNdProfile(env)).prefs).toEqual(defaultNdPreferences());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("round-trips saved preferences and preserves the gate config", async () => {
    const { env, dir } = await tempHome();
    try {
      const gates = setGateEnabled(defaultNdConfig(), "research", false);
      await saveNdConfig(gates, env);
      const prefs = setNdPreference(defaultNdPreferences(), "outputDensity", "minimal");
      await saveNdPreferences(prefs, env);

      const loaded = await loadNdProfile(env);
      expect(loaded.prefs.outputDensity).toBe("minimal"); // pref persisted
      expect(loaded.gates.research.enabled).toBe(false); // gate config preserved
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("saving a gate config preserves previously-saved preferences", async () => {
    const { env, dir } = await tempHome();
    try {
      await saveNdPreferences(setNdPreference(defaultNdPreferences(), "timeSupport", "off"), env);
      await saveNdConfig(setGateEnabled(defaultNdConfig(), "inhibit", false), env);
      const loaded = await loadNdProfile(env);
      expect(loaded.prefs.timeSupport).toBe("off"); // not clobbered by the gate save
      expect(loaded.gates.inhibit.enabled).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("merges partial saved preferences over defaults", async () => {
    const { env, dir } = await tempHome();
    try {
      await writeFile(
        ndProfilePath(env),
        JSON.stringify({ prefs: { sensoryLoad: "low" } }),
        "utf8",
      );
      const prefs = (await loadNdProfile(env)).prefs;
      expect(prefs.sensoryLoad).toBe("low"); // from file
      expect(prefs.outputDensity).toBe("balanced"); // default preserved
      expect(prefs.timeSupport).toBe("ranges"); // default preserved
      expect(prefs.capacity).toBe("auto"); // no state inferred for an old profile
      expect(prefs.memoryLoad).toBe("auto");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads a legacy bare-gate-map file (no gates/prefs keys) with default prefs", async () => {
    const { env, dir } = await tempHome();
    try {
      // The legacy on-disk shape was the bare gate map at the top level.
      await writeFile(
        ndProfilePath(env),
        JSON.stringify({ research: { enabled: false, threshold: 8 } }),
        "utf8",
      );
      const loaded = await loadNdProfile(env);
      expect(loaded.gates.research.enabled).toBe(false); // legacy gate honored
      expect(loaded.prefs).toEqual(defaultNdPreferences()); // prefs default in
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("getOutputDensity reads the persisted density via the cache", async () => {
    const { env, dir } = await tempHome();
    try {
      await saveNdPreferences(setNdPreference(defaultNdPreferences(), "outputDensity", "rich"), env);
      invalidateNdConfig();
      expect(await getOutputDensity(env)).toBe("rich");
    } finally {
      invalidateNdConfig();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("persists the full {gates, prefs} shape to disk", async () => {
    const { env, dir } = await tempHome();
    try {
      await saveNdProfile(defaultNdProfile(), env);
      const raw = JSON.parse(await readFile(ndProfilePath(env), "utf8"));
      expect(raw).toHaveProperty("gates");
      expect(raw).toHaveProperty("prefs");
      expect(raw.prefs.outputDensity).toBe("balanced");
      expect(raw.prefs.capacity).toBe("auto");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
