import { describe, expect, it } from "vitest";
import { createConversation } from "../agent.js";
import type {
  CompletionResult,
  LLMProvider,
  StreamChunk,
} from "../providers/interface.js";
import type { SafetyClient } from "../safety-client.js";
import type { ToolRegistry } from "../tools/registry.js";
import { createVoiceTurnSpeaker, type TtsSynthesize } from "../tts/streaming.js";

class GatedStreamingProvider implements LLMProvider {
  completed = false;
  release: (() => void) | undefined;

  modelId(): string {
    return "streaming-tts-proof";
  }

  contextWindow(): number {
    return 100_000;
  }

  async complete(): Promise<CompletionResult> {
    throw new Error("whole-response fallback should not run");
  }

  async *stream(): AsyncIterable<StreamChunk> {
    yield { type: "text", delta: "The first clause is ready." };
    await new Promise<void>((resolve) => { this.release = resolve; });
    yield { type: "text", delta: " The second clause follows." };
    this.completed = true;
    yield {
      type: "done",
      result: {
        text: "The first clause is ready. The second clause follows.",
        toolCalls: [],
        finishReason: "stop",
      },
    };
  }
}

const fakeSafety = { logEvent: async () => {} } as unknown as SafetyClient;
const emptyRegistry = { schemas: () => [], get: () => undefined } as unknown as ToolRegistry;

describe("voice first-clause streaming integration", () => {
  it("dispatches TTS before the LLM finishes, then drains in order", async () => {
    const provider = new GatedStreamingProvider();
    const spoken: string[] = [];
    let firstSpeech: (() => void) | undefined;
    const firstSpeechStarted = new Promise<void>((resolve) => { firstSpeech = resolve; });
    const synth: TtsSynthesize = async (text) => {
      spoken.push(text);
      firstSpeech?.();
      return { ok: true, output: "played" };
    };
    const speaker = createVoiceTurnSpeaker({
      VANTA_TTS_STREAMING: "1",
      VANTA_TTS_STREAMING_PROVIDER: "local",
      VANTA_TTS_STREAM_MIN_CHARS: "8",
    }, { synthesize: synth });
    const convo = createConversation("sys", {
      provider,
      safety: fakeSafety,
      registry: emptyRegistry,
      root: "/tmp",
      requestApproval: async () => false,
      ...speaker.callbacks,
    });

    const turn = speaker.run(() => convo.send("answer aloud"));
    await firstSpeechStarted;
    expect(provider.completed).toBe(false);
    expect(spoken).toEqual(["The first clause is ready."]);
    provider.release?.();
    const result = await turn;

    expect(result.outcome.finalText).toBe(
      "The first clause is ready. The second clause follows.",
    );
    expect(spoken).toEqual([
      "The first clause is ready.",
      "The second clause follows.",
    ]);
    expect(result.speech.mode).toBe("streaming");
    expect(result.speech.spokenClauses).toBe(2);
  });
});
