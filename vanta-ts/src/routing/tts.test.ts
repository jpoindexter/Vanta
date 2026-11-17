import { describe, it, expect } from "vitest";
import { resolveStreamingTtsConfig, resolveTtsProvider } from "./tts.js";

describe("resolveTtsProvider", () => {
  it("defaults to edge (keyless, ready) when VANTA_TTS_PROVIDER is unset", () => {
    const r = resolveTtsProvider({});
    expect(r.provider.id).toBe("edge");
    expect(r.ready).toBe(true);
    expect(r.voice).toBe("en-US-AriaNeural");
    expect(r.missingKey).toBeUndefined();
  });

  it("falls back to edge for an unknown provider id", () => {
    expect(resolveTtsProvider({ VANTA_TTS_PROVIDER: "bogus" }).provider.id).toBe("edge");
  });

  it("VANTA_TTS_VOICE overrides the provider default voice", () => {
    expect(resolveTtsProvider({ VANTA_TTS_VOICE: "en-GB-RyanNeural" }).voice).toBe("en-GB-RyanNeural");
  });

  it("a key backend without its key is not ready and names the missing env", () => {
    const r = resolveTtsProvider({ VANTA_TTS_PROVIDER: "openai" });
    expect(r.provider.id).toBe("openai");
    expect(r.ready).toBe(false);
    expect(r.missingKey).toBe("OPENAI_API_KEY");
  });

  it("a key backend with its key is ready", () => {
    const r = resolveTtsProvider({ VANTA_TTS_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: "x" });
    expect(r.ready).toBe(true);
    expect(r.missingKey).toBeUndefined();
  });

  it("local is keyless and always ready", () => {
    const r = resolveTtsProvider({ VANTA_TTS_PROVIDER: "local" });
    expect(r.provider.id).toBe("local");
    expect(r.ready).toBe(true);
  });

  it("does not mutate the input env", () => {
    const env = { VANTA_TTS_PROVIDER: "openai", OPENAI_API_KEY: "x" };
    const copy = { ...env };
    resolveTtsProvider(env);
    expect(env).toEqual(copy);
  });
});

describe("resolveStreamingTtsConfig", () => {
  it("is opt-in and uses bounded clause defaults", () => {
    const config = resolveStreamingTtsConfig({});
    expect(config.enabled).toBe(false);
    expect(config.minClauseChars).toBe(24);
    expect(config.maxClauseChars).toBe(240);
    expect(config.maxClauses).toBe(24);
  });

  it("supports a dedicated provider and clamps unsafe bounds", () => {
    const config = resolveStreamingTtsConfig({
      VANTA_TTS_STREAMING: "yes",
      VANTA_TTS_PROVIDER: "edge",
      VANTA_TTS_STREAMING_PROVIDER: "local",
      VANTA_TTS_STREAMING_VOICE: "Daniel",
      VANTA_TTS_STREAM_MIN_CHARS: "-1",
      VANTA_TTS_STREAM_MAX_CHARS: "99999",
      VANTA_TTS_STREAM_MAX_CLAUSES: "999",
    });
    expect(config.enabled).toBe(true);
    expect(config.tts.provider.id).toBe("local");
    expect(config.tts.voice).toBe("Daniel");
    expect(config.minClauseChars).toBe(1);
    expect(config.maxClauseChars).toBe(2_000);
    expect(config.maxClauses).toBe(100);
  });
});
