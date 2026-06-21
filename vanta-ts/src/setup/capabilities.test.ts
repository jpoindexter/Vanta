import { describe, it, expect } from "vitest";
import { planCapabilities, applyCapabilityPlan, type CapabilityPlan } from "./capabilities.js";

describe("planCapabilities", () => {
  it("desktop on macOS → opens both panes, installs cliclick when absent", () => {
    const p = planCapabilities({ platform: "darwin", cliclickPresent: false, choice: { desktop: true, voice: false, autoTune: false } });
    expect(p.openPanes).toEqual(["screen-recording", "accessibility"]);
    expect(p.installCliclick).toBe(true);
  });
  it("desktop with cliclick already present → no install", () => {
    const p = planCapabilities({ platform: "darwin", cliclickPresent: true, choice: { desktop: true, voice: false, autoTune: false } });
    expect(p.installCliclick).toBe(false);
  });
  it("voice → mic pane + VANTA_VOICE_PTT; autoTune → VANTA_LORA_AUTO", () => {
    const p = planCapabilities({ platform: "darwin", cliclickPresent: true, choice: { desktop: false, voice: true, autoTune: true } });
    expect(p.openPanes).toEqual(["microphone"]);
    expect(p.env).toEqual({ VANTA_VOICE_PTT: "1", VANTA_LORA_AUTO: "1" });
  });
  it("non-macOS desktop → note, no panes (env still writes for autoTune)", () => {
    const p = planCapabilities({ platform: "linux", cliclickPresent: false, choice: { desktop: true, voice: false, autoTune: true } });
    expect(p.openPanes).toEqual([]);
    expect(p.notes.join(" ")).toMatch(/macOS-only/);
    expect(p.env).toEqual({ VANTA_LORA_AUTO: "1" });
  });
});

describe("applyCapabilityPlan", () => {
  it("installs cliclick, opens panes, writes env via injected executors", async () => {
    const plan: CapabilityPlan = {
      installCliclick: true,
      openPanes: ["screen-recording", "microphone"],
      env: { VANTA_VOICE_PTT: "1" },
      notes: [],
    };
    let installed = "";
    const opened: string[] = [];
    let wrote: Record<string, string> | null = null;
    await applyCapabilityPlan(plan, {
      installBrew: (pkg) => { installed = pkg; return { ok: true, message: `installed ${pkg}` }; },
      openPane: (p) => { opened.push(p); return { ok: true, message: `opened ${p}` }; },
      writeEnv: async (e) => { wrote = e; },
      log: () => {},
    });
    expect(installed).toBe("cliclick");
    expect(opened).toEqual(["screen-recording", "microphone"]);
    expect(wrote).toEqual({ VANTA_VOICE_PTT: "1" });
  });

  it("no installs/env when the plan is empty", async () => {
    let touched = false;
    await applyCapabilityPlan({ installCliclick: false, openPanes: [], env: {}, notes: [] }, {
      installBrew: () => { touched = true; return { ok: true, message: "" }; },
      writeEnv: async () => { touched = true; },
      log: () => {},
    });
    expect(touched).toBe(false);
  });
});
