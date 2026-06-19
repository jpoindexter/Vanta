import { describe, it, expect } from "vitest";
import { TTS_CATALOG, ttsAvailability, ttsProviderById } from "./registry.js";

describe("TTS_CATALOG", () => {
  it("offers edge (keyless default), openai, elevenlabs, and local", () => {
    expect(TTS_CATALOG.map((p) => p.id)).toEqual(["edge", "openai", "elevenlabs", "local"]);
  });

  it("marks edge and local keyless and the API backends key-based", () => {
    expect(ttsProviderById("edge")!.keyless).toBe(true);
    expect(ttsProviderById("local")!.keyless).toBe(true);
    expect(ttsProviderById("openai")!.envVar).toBe("OPENAI_API_KEY");
    expect(ttsProviderById("elevenlabs")!.envVar).toBe("ELEVENLABS_API_KEY");
  });

  it("gives every backend a default voice and setup steps", () => {
    for (const p of TTS_CATALOG) {
      expect(p.defaultVoice).toBeTruthy();
      expect(p.setupSteps.length).toBeGreaterThan(0);
    }
  });
});

describe("ttsAvailability", () => {
  it("keyless backends are always configured", () => {
    expect(ttsAvailability(ttsProviderById("edge")!, {})).toEqual({ configured: true, missing: [] });
    expect(ttsAvailability(ttsProviderById("local")!, {})).toEqual({ configured: true, missing: [] });
  });

  it("a key backend is configured only when its env var is present", () => {
    const openai = ttsProviderById("openai")!;
    expect(ttsAvailability(openai, {})).toEqual({ configured: false, missing: ["OPENAI_API_KEY"] });
    expect(ttsAvailability(openai, { OPENAI_API_KEY: "sk-x" })).toEqual({ configured: true, missing: [] });
  });

  it("treats a blank key as missing", () => {
    expect(ttsAvailability(ttsProviderById("elevenlabs")!, { ELEVENLABS_API_KEY: "   " }).configured).toBe(false);
  });
});
