import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  settingsChanged,
  readSettingsSig,
  reloadSettingsIfChanged,
  type ReloadDeps,
} from "./hot-reload.js";
import type { Settings } from "./store.js";

describe("settingsChanged", () => {
  it("returns false on the first probe (null prior, nothing to diverge from)", () => {
    expect(settingsChanged(null, "abc")).toBe(false);
  });

  it("returns false for an empty-string prior", () => {
    expect(settingsChanged("", "abc")).toBe(false);
  });

  it("returns false when the signature is unchanged", () => {
    expect(settingsChanged("abc", "abc")).toBe(false);
  });

  it("returns true when the signature changed", () => {
    expect(settingsChanged("abc", "def")).toBe(true);
  });
});

describe("readSettingsSig", () => {
  let root: string;
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-hotreload-root-"));
    home = await mkdtemp(join(tmpdir(), "vanta-hotreload-home-"));
    env = { VANTA_HOME: home };
    await mkdir(join(root, ".vanta"), { recursive: true });
  });

  afterEach(async () => {
    await Promise.all([
      rm(root, { recursive: true }).catch(() => {}),
      rm(home, { recursive: true }).catch(() => {}),
    ]);
  });

  it("is stable when no settings file changes", () => {
    const a = readSettingsSig(root, env);
    const b = readSettingsSig(root, env);
    expect(a).toBe(b);
  });

  it("uses a stable placeholder for missing scopes (no throw)", () => {
    const sig = readSettingsSig(root, env);
    expect(sig).toBe("-|-|-");
  });

  it("changes when a scope file is created", async () => {
    const before = readSettingsSig(root, env);
    await writeFile(join(home, "settings.json"), JSON.stringify({ env: { VANTA_SPINNER: "dots" } }));
    const after = readSettingsSig(root, env);
    expect(after).not.toBe(before);
  });
});

/** Build deps with sane defaults; override per case. */
function makeDeps(over: Partial<ReloadDeps>): ReloadDeps {
  return {
    readSig: () => "sig-1",
    loadSettings: async () => ({}),
    applyEnv: () => {},
    prevSig: "sig-0",
    ...over,
  };
}

describe("reloadSettingsIfChanged — no-op paths", () => {
  it("does not reload or apply when the signature is unchanged", async () => {
    let loaded = 0;
    let applied = 0;
    const res = await reloadSettingsIfChanged(makeDeps({
      readSig: () => "same",
      prevSig: "same",
      loadSettings: async () => { loaded++; return {}; },
      applyEnv: () => { applied++; },
    }));
    expect(res).toEqual({ reloaded: false });
    expect(loaded).toBe(0);
    expect(applied).toBe(0);
  });

  it("does not reload on the first probe (null prevSig)", async () => {
    let loaded = 0;
    const res = await reloadSettingsIfChanged(makeDeps({
      readSig: () => "sig-1",
      prevSig: null,
      loadSettings: async () => { loaded++; return {}; },
    }));
    expect(res).toEqual({ reloaded: false });
    expect(loaded).toBe(0);
  });
});

describe("reloadSettingsIfChanged — reload + error-as-values", () => {
  it("reloads + applies + returns the new sig when changed", async () => {
    const settings: Settings = { env: { VANTA_SPINNER: "dots" } };
    const applied: Settings[] = [];
    const res = await reloadSettingsIfChanged(makeDeps({
      readSig: () => "sig-new",
      prevSig: "sig-old",
      loadSettings: async () => settings,
      applyEnv: (s) => { applied.push(s); },
    }));
    expect(res.reloaded).toBe(true);
    if (res.reloaded) {
      expect(res.newSig).toBe("sig-new");
      expect(res.settings).toBe(settings);
    }
    expect(applied).toEqual([settings]);
  });

  it("re-applies the safe env subset via the injected applyEnv", async () => {
    const processEnv: NodeJS.ProcessEnv = {};
    const settings: Settings = { env: { VANTA_NEW: "1" } };
    const res = await reloadSettingsIfChanged(makeDeps({
      readSig: () => "b",
      prevSig: "a",
      loadSettings: async () => settings,
      // Mirror applySettingsEnv's contract: only add, never overwrite.
      applyEnv: (s) => {
        for (const [k, v] of Object.entries(s.env ?? {})) {
          if (!processEnv[k]) processEnv[k] = v;
        }
      },
    }));
    expect(res.reloaded).toBe(true);
    expect(processEnv.VANTA_NEW).toBe("1");
  });
});

describe("reloadSettingsIfChanged — failures keep prior state", () => {
  it("keeps prior state (no reload) when loadSettings throws — missing/corrupt file", async () => {
    let applied = 0;
    const res = await reloadSettingsIfChanged(makeDeps({
      readSig: () => "changed",
      prevSig: "prior",
      loadSettings: async () => { throw new Error("corrupt JSON"); },
      applyEnv: () => { applied++; },
    }));
    expect(res).toEqual({ reloaded: false });
    expect(applied).toBe(0);
  });

  it("keeps prior state (no reload) when readSig throws", async () => {
    let loaded = 0;
    const res = await reloadSettingsIfChanged(makeDeps({
      readSig: () => { throw new Error("stat failed"); },
      prevSig: "prior",
      loadSettings: async () => { loaded++; return {}; },
    }));
    expect(res).toEqual({ reloaded: false });
    expect(loaded).toBe(0);
  });

  it("does not claim a reload when applyEnv throws", async () => {
    const res = await reloadSettingsIfChanged(makeDeps({
      readSig: () => "b",
      prevSig: "a",
      loadSettings: async () => ({ env: { X: "1" } }),
      applyEnv: () => { throw new Error("apply failed"); },
    }));
    expect(res).toEqual({ reloaded: false });
  });
});
