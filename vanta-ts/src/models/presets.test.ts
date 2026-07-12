import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
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
  /* per-test temp home; nothing global mutated */
});

const env = (): NodeJS.ProcessEnv => ({ VANTA_HOME: home });

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
    await savePresets(rememberPreset({}, "qwen2.5:14b", { effort: "max" }, new Date()), env());
    const ctx = {
      env: { ...env(), VANTA_PROVIDER: "ollama" },
      state: {},
      setup: { effortLevel: "medium", provider: { modelId: () => "old" } },
      convo: { setProvider: () => {} },
      dataDir: join(home, ".vanta"),
    } as unknown as ReplCtx;
    const r = await model("ollama qwen2.5:14b", ctx);
    expect(r.output).toContain("effort max (remembered)");
    expect((ctx as { state: { effortLevel?: string } }).state.effortLevel).toBe("max");
    expect(ctx.setup.effortLevel).toBe("max");
    expect(ctx.env.VANTA_EFFORT_LEVEL).toBeUndefined();
  });
});

describe("/effort remembers for the active model", () => {
  it("changing effort persists a preset keyed by the provider's modelId", async () => {
    const ctx = {
      env: env(),
      state: {},
      setup: { effortLevel: "medium", provider: { modelId: () => "test-model" } },
    } as unknown as ReplCtx;
    const r = await effort("high", ctx);
    expect(r.output).toContain("high");
    await new Promise((res) => setTimeout(res, 25)); // rememberEffort is fire-and-forget
    const saved = JSON.parse(await readFile(presetsPath(env()), "utf8"));
    expect(saved["test-model"]).toMatchObject({ effort: "high" });
  });
});
