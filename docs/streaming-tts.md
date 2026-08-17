# Streaming TTS

## Outcome

Vanta can begin a spoken reply after the first complete clause instead of
waiting for the model’s entire answer. The behavior is opt-in and applies to
the push-to-talk and wake-word voice loops.

```text
LLM token stream → deterministic clause splitter → bounded TTS queue → speaker
```

Existing Edge, OpenAI, ElevenLabs, and macOS `say` synthesis adapters are reused
unchanged. When model streaming is unavailable—or streaming TTS is disabled—the
same configured provider speaks the complete final response.

## Configuration

Run `vanta setup tts` and answer **yes** to “Speak after the first complete
clause?”, or configure:

```bash
VANTA_TTS_STREAMING=1
VANTA_TTS_STREAMING_PROVIDER=local
VANTA_TTS_STREAMING_VOICE=Daniel
```

`VANTA_TTS_STREAMING_PROVIDER` and `VANTA_TTS_STREAMING_VOICE` are optional;
without them, the normal `VANTA_TTS_PROVIDER` and `VANTA_TTS_VOICE` apply.

Latency and queue guards:

| Setting | Default | Bound |
|---|---:|---:|
| `VANTA_TTS_STREAM_MIN_CHARS` | 24 | 1–500 |
| `VANTA_TTS_STREAM_MAX_CHARS` | 240 | minimum–2,000 |
| `VANTA_TTS_STREAM_MAX_CLAUSES` | 24 | 1–100 |

## Behavior and Safety

- Sentence punctuation, semicolons, colons, and newlines create clause
  boundaries. Common abbreviations and decimal points do not.
- Long run-on output is split at whitespace to bound silence and memory.
- Clauses play sequentially so speech never overlaps itself.
- When a tool call begins, unspoken draft clauses are discarded and the next
  model pass starts a fresh speech segment.
- The first already-playing clause cannot be “unsaid.” Streaming voice is
  therefore opt-in; operators can leave it disabled for strictly canonical
  whole-response speech.
- One synthesis failure trips the turn’s speech circuit breaker. Remaining
  clauses are not retried repeatedly.
- A fixed clause budget prevents a long response from creating an unbounded
  audio backlog.

## Proof Boundary

The integration test drives the real Vanta conversation stream and proves that
the first clause reaches the synthesis boundary before the model emits its
completion, then verifies ordered queue drain and whole-response fallback. It
uses an injected silent synthesis adapter, so it does not prove speaker volume,
network-provider latency, or audio quality on the operator’s machine.

Messaging gateways currently expose text, images, and completed file uploads,
not a live audio-chunk contract. Gateway voice streaming remains a separate
roadmap item; this release does not send a sequence of audio files into chats
and call that streaming.
