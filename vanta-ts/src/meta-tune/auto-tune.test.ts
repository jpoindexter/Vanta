import { describe, it, expect } from "vitest";
import { shouldAutoTune, autoTuneCheck, loraAutoEnabled, autoBaseModel } from "./auto-tune.js";
import type { PreferenceSignal } from "../preferences/signals.js";
import type { RunLoraTrainOutcome } from "./lora-train.js";

function sigs(n: number): PreferenceSignal[] {
  return Array.from({ length: n }, (_, i) =>
    ({ context: `q${i}`, chosen: { label: "a", value: `good ${i}` }, rejected: { label: "b", value: `bad ${i}` } } as unknown as PreferenceSignal),
  );
}
const trained: RunLoraTrainOutcome = {
  ok: true,
  readiness: { usablePairs: 25, ready: true, reason: "ok" },
  result: { ok: true, device: "mps", examples: 25, trainableLoraParams: 1, lossFirst: 1, lossLast: 1, lossDecreased: true, adapterSaved: true, adapterDir: "/a" },
};
const noStore = { read: () => { throw new Error("none"); }, write: () => {} };

describe("shouldAutoTune", () => {
  it("first train at threshold, retrain only after +threshold more", () => {
    expect(shouldAutoTune(19, 0)).toBe(false);
    expect(shouldAutoTune(20, 0)).toBe(true);
    expect(shouldAutoTune(25, 20)).toBe(false); // only +5 since last train
    expect(shouldAutoTune(40, 20)).toBe(true);
  });
});

describe("loraAutoEnabled / autoBaseModel", () => {
  it("auto is off by default; base model defaults to a small real model", () => {
    expect(loraAutoEnabled({})).toBe(false);
    expect(loraAutoEnabled({ VANTA_LORA_AUTO: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(autoBaseModel({})).toMatch(/Qwen/);
    expect(autoBaseModel({ VANTA_LORA_BASE_MODEL: "meta-llama/x" } as NodeJS.ProcessEnv)).toBe("meta-llama/x");
  });
});

describe("autoTuneCheck", () => {
  it("not enough data → not-ready, no train", async () => {
    const r = await autoTuneCheck({ dataDir: "/d", env: {} as NodeJS.ProcessEnv, readSignals: async () => sigs(5), ...noStore });
    expect(r.status).toBe("not-ready");
  });

  it("ready but auto disabled → 'ready' nudge, does NOT train", async () => {
    let didTrain = false;
    const r = await autoTuneCheck({
      dataDir: "/d",
      env: {} as NodeJS.ProcessEnv,
      readSignals: async () => sigs(25),
      train: () => { didTrain = true; return trained; },
      ...noStore,
    });
    expect(r.status).toBe("ready");
    expect(didTrain).toBe(false);
    if (r.status === "ready") expect(r.message).toMatch(/VANTA_LORA_AUTO=1/);
  });

  it("ready + auto enabled → trains + records the pair count", async () => {
    let wrote = "";
    const r = await autoTuneCheck({
      dataDir: "/d",
      env: { VANTA_LORA_AUTO: "1" } as NodeJS.ProcessEnv,
      readSignals: async () => sigs(25),
      train: () => trained,
      read: () => { throw new Error("none"); },
      write: (_p, c) => (wrote = c),
    });
    expect(r.status).toBe("trained");
    expect(wrote).toContain("lastTrainedPairs");
  });
});
