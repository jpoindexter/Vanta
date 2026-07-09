import { describe, expect, it, vi } from "vitest";
import { runWakeLoop } from "./wake-loop.js";

function clips(...paths: string[]) {
  const cleaned: string[] = [];
  return {
    cleaned,
    capture: async () => {
      const path = paths.shift();
      if (!path) throw new Error("no fixture clip");
      return { path, cleanup: async () => { cleaned.push(path); } };
    },
  };
}

describe("runWakeLoop", () => {
  it("keeps ordinary speech local, deletes clips, and never opens an agent turn", async () => {
    const fixture = clips("/normal-1.wav", "/normal-2.wav");
    const onTurn = vi.fn(async () => {});
    const result = await runWakeLoop({
      maxWindows: 2,
      capture: fixture.capture,
      transcribe: (path) => ({ ok: true, text: path.includes("1") ? "The roadmap is ready" : "Hey Santa" }),
      chime: async () => {},
      onTurn,
    });
    expect(result).toEqual({ windows: 2, wakes: 0, turns: 0 });
    expect(onTurn).not.toHaveBeenCalled();
    expect(fixture.cleaned).toEqual(["/normal-1.wav", "/normal-2.wav"]);
  });

  it("uses speech after the wake phrase without recording another clip", async () => {
    const fixture = clips("/wake.wav");
    const onTurn = vi.fn(async () => {});
    const chime = vi.fn(async () => {});
    const result = await runWakeLoop({
      maxWindows: 1,
      capture: fixture.capture,
      transcribe: () => ({ ok: true, text: "Hey, Vanta, open the roadmap" }),
      chime,
      onTurn,
      log: () => {},
    });
    expect(result).toEqual({ windows: 1, wakes: 1, turns: 1 });
    expect(chime).toHaveBeenCalledOnce();
    expect(onTurn).toHaveBeenCalledWith("open the roadmap");
    expect(fixture.cleaned).toEqual(["/wake.wav"]);
  });

  it("opens and cleans a second listening clip after a phrase-only wake", async () => {
    const fixture = clips("/wake.wav", "/turn.wav");
    const onTurn = vi.fn(async () => {});
    const result = await runWakeLoop({
      maxWindows: 1,
      capture: fixture.capture,
      transcribe: (path) => ({ ok: true, text: path.includes("wake") ? "Hey Vanta" : "What is next?" }),
      chime: async () => {},
      onTurn,
      log: () => {},
    });
    expect(result).toEqual({ windows: 1, wakes: 1, turns: 1 });
    expect(onTurn).toHaveBeenCalledWith("What is next?");
    expect(fixture.cleaned).toEqual(["/wake.wav", "/turn.wav"]);
  });

  it("stops a managed listener before taking another audio window", async () => {
    const fixture = clips("/one.wav");
    let checks = 0;
    const result = await runWakeLoop({
      capture: fixture.capture,
      transcribe: () => ({ ok: true, text: "ordinary speech" }),
      shouldContinue: () => ++checks === 1,
      onTurn: async () => {},
    });
    expect(result.windows).toBe(1);
    expect(checks).toBe(2);
  });
});
