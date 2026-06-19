import { describe, it, expect, afterEach } from "vitest";
import { speakTool } from "./speak.js";
import type { ToolContext } from "./types.js";

const TTS_ENV = ["VANTA_TTS_PROVIDER", "VANTA_TTS_VOICE", "OPENAI_API_KEY", "ELEVENLABS_API_KEY"] as const;

describe("speakTool", () => {
  afterEach(() => {
    for (const k of TTS_ENV) delete process.env[k];
  });

  it("requires text", async () => {
    const r = await speakTool.execute({}, {} as ToolContext);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/text/);
  });

  it("safety label leaks nothing", () => {
    expect(speakTool.describeForSafety?.({ text: "my secret" })).toBe("speak text aloud");
  });

  it("fails gracefully (no live call) when a key backend lacks its key", async () => {
    process.env.VANTA_TTS_PROVIDER = "openai";
    const r = await speakTool.execute({ text: "hi" }, {} as ToolContext);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/OPENAI_API_KEY/);
    expect(r.output).toMatch(/vanta setup tts/);
  });

  it("fails gracefully when ElevenLabs lacks its key", async () => {
    process.env.VANTA_TTS_PROVIDER = "elevenlabs";
    const r = await speakTool.execute({ text: "hi" }, {} as ToolContext);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/ELEVENLABS_API_KEY/);
  });
});
