import { describe, it, expect } from "vitest";
import { formatVoiceResult, voiceInputTool } from "./voice-input-tool.js";

describe("formatVoiceResult", () => {
  it("ok flow → transcript as output", () => {
    const r = formatVoiceResult({ ok: true, transcript: "open the roadmap", state: { phase: "done" } as never });
    expect(r).toEqual({ ok: true, output: "open the roadmap" });
  });
  it("empty transcript → not-ok with a clear message", () => {
    const r = formatVoiceResult({ ok: true, transcript: "   ", state: { phase: "done" } as never });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/no speech/);
  });
  it("flow failure → not-ok, surfaces the error", () => {
    const r = formatVoiceResult({ ok: false, error: "ffmpeg not installed", state: { phase: "error" } as never });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/voice input failed: ffmpeg not installed/);
  });
});

describe("voiceInputTool", () => {
  it("is kernel-gateable + takes no args", () => {
    expect(voiceInputTool.schema.name).toBe("voice_input");
    expect(voiceInputTool.describeForSafety?.({})).toMatch(/record.*transcribe/);
    expect(voiceInputTool.schema.parameters.required).toEqual([]);
  });
});
