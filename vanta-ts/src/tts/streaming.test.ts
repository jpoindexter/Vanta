import { describe, expect, it, vi } from "vitest";
import type { AgentOutcome } from "../agent.js";
import { resolveStreamingTtsConfig } from "../routing/tts.js";
import type { SpeakOutcome } from "./synth.js";
import {
  createVoiceTurnSpeaker,
  StreamingSpeechSession,
  type TtsSynthesize,
} from "./streaming.js";

const outcome = (finalText: string): AgentOutcome => ({
  finalText,
  iterations: 1,
  stoppedReason: "done",
  toolIterations: 0,
});

function localStreamingConfig() {
  return resolveStreamingTtsConfig({
    VANTA_TTS_STREAMING: "1",
    VANTA_TTS_STREAMING_PROVIDER: "local",
    VANTA_TTS_STREAM_MIN_CHARS: "8",
  });
}

describe("StreamingSpeechSession", () => {
  it("starts synthesis as soon as the first clause arrives", async () => {
    let now = 100;
    const spoken: string[] = [];
    const synth: TtsSynthesize = vi.fn(async (text) => {
      spoken.push(text);
      return { ok: true, output: "ok" };
    });
    const session = new StreamingSpeechSession(localStreamingConfig(), {
      synthesize: synth,
      now: () => now,
    });
    now = 140;
    session.push("First clause. Second");
    await Promise.resolve();
    expect(spoken).toEqual(["First clause."]);
    const receipt = await session.finish("First clause. Second");
    expect(spoken).toEqual(["First clause.", "Second"]);
    expect(receipt.firstClauseMs).toBe(40);
    expect(receipt.spokenClauses).toBe(2);
  });

  it("drops queued interim prose when a tool call begins", async () => {
    let releaseFirst: (() => void) | undefined;
    const spoken: string[] = [];
    const synth: TtsSynthesize = vi.fn((text) => {
      spoken.push(text);
      if (text !== "Spoken draft.") {
        return Promise.resolve<SpeakOutcome>({ ok: true, output: "ok" });
      }
      return new Promise<SpeakOutcome>((resolve) => {
        releaseFirst = () => resolve({ ok: true, output: "ok" });
      });
    });
    const session = new StreamingSpeechSession(localStreamingConfig(), { synthesize: synth });
    session.push("Spoken draft. Queued draft.");
    await Promise.resolve();
    session.markToolBoundary();
    session.push("Canonical answer.");
    releaseFirst?.();
    const receipt = await session.finish("Canonical answer.");
    expect(spoken).toEqual(["Spoken draft.", "Canonical answer."]);
    expect(receipt.toolBoundaries).toBe(1);
    expect(receipt.droppedClauses).toBe(1);
  });

  it("stops the queue after a provider failure", async () => {
    const synth: TtsSynthesize = vi.fn(async () => ({ ok: false, output: "offline" }));
    const session = new StreamingSpeechSession(localStreamingConfig(), { synthesize: synth });
    session.push("First clause. Second clause.");
    const receipt = await session.finish("First clause. Second clause.");
    expect(synth).toHaveBeenCalledTimes(1);
    expect(receipt.error).toBe("offline");
    expect(receipt.spokenClauses).toBe(0);
  });

  it("replaces unspoken drift with the canonical final response", async () => {
    const spoken: string[] = [];
    const session = new StreamingSpeechSession(localStreamingConfig(), {
      synthesize: async (text) => {
        spoken.push(text);
        return { ok: true, output: "ok" };
      },
    });
    session.push("Provider stream ended without a clause");
    const receipt = await session.finish("Canonical fallback.");
    expect(spoken).toEqual(["Canonical fallback."]);
    expect(receipt.drifted).toBe(true);
  });
});

describe("createVoiceTurnSpeaker", () => {
  it("preserves whole-response synthesis when streaming is disabled", async () => {
    const synth: TtsSynthesize = vi.fn(async () => ({ ok: true, output: "ok" }));
    const speaker = createVoiceTurnSpeaker({
      VANTA_TTS_PROVIDER: "local",
    }, { synthesize: synth });
    expect(speaker.callbacks.onTextDelta).toBeUndefined();
    const result = await speaker.run(async () => outcome("Whole response."));
    expect(synth).toHaveBeenCalledWith(
      "Whole response.",
      expect.objectContaining({ provider: expect.objectContaining({ id: "local" }) }),
      expect.any(Object),
    );
    expect(result.speech.mode).toBe("whole");
  });

  it("routes token deltas and tool boundaries into an active turn", async () => {
    const spoken: string[] = [];
    const speaker = createVoiceTurnSpeaker({
      VANTA_TTS_STREAMING: "1",
      VANTA_TTS_STREAMING_PROVIDER: "local",
      VANTA_TTS_STREAM_MIN_CHARS: "4",
    }, {
      synthesize: async (text) => {
        spoken.push(text);
        return { ok: true, output: "ok" };
      },
    });
    const result = await speaker.run(async () => {
      speaker.callbacks.onTextDelta?.("Draft.");
      speaker.callbacks.onToolCall?.("read_file", {});
      speaker.callbacks.onTextDelta?.("Final.");
      return outcome("Final.");
    });
    expect(spoken).toContain("Final.");
    expect(result.speech.toolBoundaries).toBe(1);
  });

  it("cancels pending speech when the agent turn throws", async () => {
    let release: (() => void) | undefined;
    const synth: TtsSynthesize = vi.fn(() => new Promise<SpeakOutcome>((resolve) => {
      release = () => resolve({ ok: true, output: "ok" });
    }));
    const speaker = createVoiceTurnSpeaker({
      VANTA_TTS_STREAMING: "1",
      VANTA_TTS_STREAMING_PROVIDER: "local",
      VANTA_TTS_STREAM_MIN_CHARS: "4",
    }, { synthesize: synth });
    await expect(speaker.run(async () => {
      speaker.callbacks.onTextDelta?.("Playing clause. Queued clause.");
      await Promise.resolve();
      throw new Error("provider failed");
    })).rejects.toThrow("provider failed");
    release?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(synth).toHaveBeenCalledTimes(1);
  });
});
