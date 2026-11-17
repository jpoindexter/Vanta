import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPresets, savePresets, rememberPreset, presetFor, rememberEffort, presetsPath } from "./presets.js";
import { effort } from "../repl/effort-cmd.js";
import type { ReplCtx } from "../repl/types.js";

// OP-MODEL-PRESETS — selecting a model re-applies its remembered effort;
// changing effort updates the per-model memory; persistence round-trips.

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-presets-"));
});
afterEach(() => {
  return rm(home, { recursive: true, force: true });
});

const env = (): NodeJS.ProcessEnv => ({
  VANTA_HOME: home,
  CLAUDE_CONFIG_DIR: join(home, "claude"),
  VANTA_CLAUDE_KEYCHAIN_SERVICE: `vanta-test-missing-${home}`,
});

describe("preset store", () => {
  it("remember → save → load round-trips per model", async () => {
    const NOW = new Date("2026-07-07T09:00:00Z");
    let map = rememberPreset({}, "gpt-5.5", { effort: "medium" }, NOW);
    map = rememberPreset(map, "qwen2.5:14b", { effort: "max" }, NOW);
    await savePresets(map, env());
    const loaded = await loadPresets(env());
    expect(presetFor(loaded, "gpt-5.5")).toMatchObject({ effort: "medium" });
    expect(presetFor(loaded, "qwen2.5:14b")).toMatchObject({ effort: "max" });
    expect(presetFor(loaded, "unknown")).toBeNull();
  });

  it("re-remembering updates the same model (merge, not duplicate)", () => {
    const NOW = new Date("2026-07-07T09:00:00Z");
    const map = rememberPreset(rememberPreset({}, "m", { effort: "low" }, NOW), "m", { effort: "high" }, NOW);
    expect(Object.keys(map)).toEqual(["m"]);
    expect(map["m"]?.effort).toBe("high");
  });

  it("a corrupt store degrades to empty, and rememberEffort never throws", async () => {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(home, { recursive: true });
    await writeFile(presetsPath(env()), "{corrupt", "utf8");
    expect(await loadPresets(env())).toEqual({});
    await rememberEffort("m1", "high", env()); // overwrites the corrupt file
    expect((await loadPresets(env()))["m1"]?.effort).toBe("high");
  });
});

describe("/model re-applies the remembered preset", () => {
  it("a session switch restores remembered effort without changing the global env", async () => {
    const { model } = await import("../repl/model-cmd.js");
    await mkdir(join(home, "claude"), { recursive: true });
    await writeFile(
      join(home, "claude", ".credentials.json"),
      JSON.stringify({ claudeAiOauth: { accessToken: "test-token", expiresAt: Date.now() + 60_000 } }),
      "utf8",
    );
    await savePresets(rememberPreset({}, "claude-sonnet-5", { effort: "max" }, new Date()), env());
    const ctx = {
      env: { ...env(), VANTA_PROVIDER: "claude-code" },
      state: {},
      setup: { effortLevel: "medium", provider: { modelId: () => "old" } },
      convo: { setProvider: () => {} },
      dataDir: join(home, ".vanta"),
    } as unknown as ReplCtx;
    const r = await model("claude-code claude-sonnet-5", ctx);
    expect(r.output).toContain("effort max (remembered)");
    expect((ctx as { state: { effortLevel?: string } }).state.effortLevel).toBe("max");
    expect(ctx.setup.effortLevel).toBe("max");
    expect(ctx.env.VANTA_EFFORT_LEVEL).toBeUndefined();
  });
});

describe("/effort session scope", () => {
  it("a session-only change does not rewrite the legacy per-model preference store", async () => {
    const ctx = {
      env: env(),
      state: {},
      setup: {
        effortLevel: "medium",
        provider: {
          modelId: () => "claude-sonnet-5",
          routeInfo: () => ({ provider: "claude-code", model: "claude-sonnet-5" }),
        },
      },
    } as unknown as ReplCtx;
    const r = await effort("high --session", ctx);
    expect(r.output).toContain("high");
    await expect(access(presetsPath(env()))).rejects.toThrow();
  });
});
