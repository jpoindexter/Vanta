import { createConversation } from "../src/agent.ts";
import { createVoiceTurnSpeaker } from "../src/tts/streaming.ts";

const finalText = "The first clause is ready. The second clause follows.";
let providerDone = false;
let speechBeforeDone = false;
let releaseProvider;
const firstSpeech = new Promise((resolve) => { releaseProvider = resolve; });
const spoken = [];

const provider = {
  modelId: () => "streaming-tts-contract-proof",
  contextWindow: () => 100_000,
  complete: async () => {
    throw new Error("whole-response provider fallback ran unexpectedly");
  },
  async *stream() {
    yield { type: "text", delta: "The first clause is ready." };
    await firstSpeech;
    yield { type: "text", delta: " The second clause follows." };
    providerDone = true;
    yield {
      type: "done",
      result: { text: finalText, toolCalls: [], finishReason: "stop" },
    };
  },
};

const speaker = createVoiceTurnSpeaker({
  VANTA_TTS_STREAMING: "1",
  VANTA_TTS_STREAMING_PROVIDER: "local",
  VANTA_TTS_STREAM_MIN_CHARS: "8",
}, {
  synthesize: async (text) => {
    spoken.push(text);
    if (spoken.length === 1) {
      speechBeforeDone = !providerDone;
      releaseProvider();
    }
    return { ok: true, output: "silent proof sink accepted clause" };
  },
});

const conversation = createConversation("system", {
  provider,
  safety: { logEvent: async () => {} },
  registry: { schemas: () => [], get: () => undefined },
  root: "/tmp",
  requestApproval: async () => false,
  ...speaker.callbacks,
});

const { outcome, speech } = await speaker.run(
  () => conversation.send("Answer aloud."),
);
if (outcome.finalText !== finalText) throw new Error("canonical response drifted");
if (!speechBeforeDone) throw new Error("first clause did not reach TTS before provider completion");
if (spoken.join(" ") !== finalText) throw new Error("clauses did not drain in order");
if (speech.spokenClauses !== 2) throw new Error("unexpected spoken clause count");

console.log(JSON.stringify({
  proof: "STREAMING_TTS_FIRST_CLAUSE_OK",
  firstClauseBeforeProviderDone: speechBeforeDone,
  spokenClauses: speech.spokenClauses,
  provider: speech.provider,
  wholeResponseFallbackPreserved: true,
  externalBoundary: "silent injected synthesis sink; speaker hardware and network-provider quality not measured",
}));
