import { describe, it, expect } from "vitest";
import { ttsProviderById } from "./tts/registry.js";
import { buildTtsEnv, renderTtsMenu, renderTtsSteps } from "./setup-tts.js";

describe("buildTtsEnv", () => {
  it("writes provider id + default voice for a keyless backend (no key)", () => {
    expect(buildTtsEnv(ttsProviderById("edge")!)).toEqual({
      VANTA_TTS_PROVIDER: "edge",
      VANTA_TTS_VOICE: "en-US-AriaNeural",
    });
  });

  it("writes the secret env for a key backend", () => {
    expect(buildTtsEnv(ttsProviderById("openai")!, "sk-secret")).toEqual({
      VANTA_TTS_PROVIDER: "openai",
      VANTA_TTS_VOICE: "alloy",
      OPENAI_API_KEY: "sk-secret",
    });
  });

  it("a typed voice overrides the provider default", () => {
    expect(buildTtsEnv(ttsProviderById("local")!, undefined, "Daniel").VANTA_TTS_VOICE).toBe("Daniel");
  });

  it("omits the key when none is given", () => {
    expect(buildTtsEnv(ttsProviderById("elevenlabs")!)).not.toHaveProperty("ELEVENLABS_API_KEY");
  });
});

describe("renderTtsMenu", () => {
  it("tags keyless backends available and key backends configured/needs-key", () => {
    expect(renderTtsMenu({})).toMatch(/Edge.*\[available\]/);
    expect(renderTtsMenu({})).toMatch(/OpenAI.*\[needs key\]/);
    expect(renderTtsMenu({ OPENAI_API_KEY: "x" })).toMatch(/OpenAI.*\[configured\]/);
  });
});

describe("renderTtsSteps", () => {
  it("shows the prerequisite, link, and numbered steps for edge", () => {
    const out = renderTtsSteps(ttsProviderById("edge")!);
    expect(out).toMatch(/prerequisite:/);
    expect(out).toMatch(/edge-tts/);
    expect(out).toMatch(/1\. /);
  });
});
