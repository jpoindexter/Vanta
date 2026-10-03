# Voice and everyday-agent delivery

Owner: Jason. Updated: 2026-10-03. Canonical status: `roadmap.json`.

## Outcome and boundaries

One ordinary Vanta agent across Desktop, terminal and background work. Add
speech input and spoken replies to the same conversations, tools, permissions,
Stop control and saved history. No separate voice agent or demo edition.

Free, local speech is the default product path. Hosted speech is optional,
explicitly selected and uses the user's own credentials; this work authorizes
no paid requests or subscriptions. Do not silently send audio or text to a
cloud provider when a local engine is unavailable. Downloading weights requires
an explicit user action, disclosed storage and license, and a recoverable result.

## Now, Next, Later

| Order | Outcome | Evidence required before closure |
| --- | --- | --- |
| Now | Finish ordinary chat, persistent approval choices and a visible Stop in the active Desktop card | Installed app: new chat, switch, restart, routine remembered consent and cancellation without duplicate work or lost draft |
| Next | Useful browser/computer work returns a saved result | Vanta performs a bounded native action and a public-research-to-document run; observe the resulting app state and reopen the cited file |
| Next within the Desktop lane | Speak instead of typing, and optionally hear replies | Select local speech, record, stop, edit the transcript, send once and interrupt playback in the installed app; text-only use still works |
| Later | Broader unattended follow-through and optional hosted speech refinements | Explicit scope, revocation, budgets, wake/restart recovery and provider-specific evidence; no hidden microphone or screen monitoring |

Sequence by user impact and dependencies, not historical card count. Preserve
the existing four Next commitments and the two-lane WIP ceiling. Voice is a
bounded part of the active Desktop outcome; a detailed voice record captures
the remaining acceptance without opening another parallel product lane.

Detailed canonical record: `VOICE-LOCAL-MODELS-AND-PROVIDERS` is **parked for the
WIP limit**, not rejected or shipped. Promote it when an open slot is released.
The active Desktop record now references voice and this sequence. The current
four Next cards remain browser action boundaries, Git probe isolation,
instruction-write boundaries and atomic local-state recovery. Those protections
are prerequisites for reliable everyday actions, not a separate polish phase.

Review after each installed vertical slice or a newly demonstrated regression.
Jason owns priority changes. There is no invented delivery date. A reproducible
chat/approval failure preempts model expansion; an unavailable local model must
not block typing, saved results or the existing agent.

## Voice acceptance contract

- One progressively disclosed Voice settings surface: input engine/model,
  output engine/voice, local or hosted label, microphone permission and a short
  user-triggered test. Keep typing available when setup fails.
- A small curated local model catalog: source revision, engine and weight
  licenses separately, download bytes, disk/RAM requirements and supported
  platforms. Show progress, cancellation, checksum verification, failure/retry,
  installed state, model selection and removal of only Vanta-owned model files.
- Download to a temporary file; publish installed state only after verified
  completion. Reject unexpected redirects, corrupt downloads, path traversal
  and insufficient storage. Never execute downloaded model content as code.
- Push-to-talk or click-to-record first. Recording, transcribing, ready, error
  and playback states are visible and accessible. Stop/unmount/restart releases
  capture resources; cancellation never submits a partial transcript.
- Transcription lands in the originating conversation's editable draft. Sending
  is deliberate, once. Switching chats must not deliver speech to another chat.
- Local output first; optional ElevenLabs/OpenAI adapters must identify network
  transfer and potential usage charges before testing. Missing keys and quota
  errors preserve the text result and never trigger an undisclosed fallback.
- Spoken output does not grant authority. All consequential actions retain the
  existing exact approvals; playback of an approval question is not consent.
- No raw audio, credentials or full private transcript in diagnostic receipts.
  Cache retention/removal and provider privacy disclosures are explicit.
- Wake-word listening, voice cloning, realtime full-duplex conversation and
  cross-channel streaming are separate later work, not prerequisites for a
  useful first local voice path.

## Evidence and re-entry

The existing speech modules and historical shipped cards do not establish a
downloadable-model Desktop experience. Current source/provider audit and
focused implementation evidence will be recorded below. No new voice card is
shipped by this plan. Resume from the canonical Desktop card and the smallest
unproven boundary, using focused tests rather than the full repository suite.

## Source audit and provider shortlist

Source inspected at `d4066399a63023ee230111b762adcc755bcda6a7`:

- `vanta-ts/src/voice/whisper-stt.ts`, `ptt-flow.ts` and `mic-capture.ts`
  contain Python Whisper and microphone capture plumbing, not a renderer mic
  interaction. The shared wrapper ignored its existing `VANTA_STT_MODEL` helper.
- `vanta-ts/src/tts/registry.ts` and `synth.ts` support macOS `say`, Edge,
  OpenAI and ElevenLabs. Here “local” means macOS speech, not a downloadable
  neural model. Keyless Edge is still a network service.
- `vanta-ts/src/setup-tts.ts` is CLI setup. No voice control or wake API
  consumer was found in `desktop-app/src`; `/api/wake` alone is not Desktop UI.
- `VANTA-VOICE-STT` historical notes acknowledge missing PTT host wiring;
  `VANTA-STREAMING-TTS-FIRST-CLAUSE` records a silent injected synthesis sink.
  Retain those records; do not infer current microphone or audible output proof.

| Role | Candidate and rationale | Open verification |
| --- | --- | --- |
| Local STT | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) with [MIT Whisper weights](https://github.com/openai/whisper#license). Documented base weights: 142 MiB, about 388 MB RAM; small: 466 MiB, about 852 MB RAM. C/C++ inference and macOS Intel/Arm support avoid a mandatory Python installation. | Pinned runtime/model hashes, exact total install size, packaged helper, language quality and measured target-machine latency. Existing Vanta adapter is Python Whisper, not whisper.cpp. |
| Local TTS | [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), Apache-2.0 weights and [library](https://github.com/hexgrad/kokoro). Main checkpoint is 327 MB; voices and runtime add more. | Official Python/PyTorch/Misaki stack has substantial dependencies; [eSpeak NG](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING) fallback carries GPLv3. Review distribution/licenses before bundling; do not label the entire bundle Apache-only. |
| Optional hosted STT/TTS | [ElevenLabs models](https://elevenlabs.io/docs/overview/models) and [streamed TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/stream), with independently selected input/output providers and user-supplied credentials. | Metered usage and plan-specific rights; no hosted call executed. [Zero retention](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode) is not the default and is not generally available on all plans. |

These are researched candidates, not installed or benchmarked Vanta integrations.
“Free local” means no per-request speech-provider fee, not zero storage, compute
or battery cost. Local speech also does not make a cloud-selected LLM local.
No weights were downloaded, microphone recording started or provider charged.

Kokoro's documented checkpoint uses `.pth`; a checksum verifies identity, not
safe deserialization. Require a restricted weights-only loader or an audited
alternative format before accepting model files into the shipped runtime.

## First bounded implementation

The shared Whisper wrapper now honors `VANTA_STT_MODEL`. Precedence is an
explicit call override, then the trimmed environment value, then the existing
`tiny` fallback. This fixes the shared PTT/gateway wrapper without silently
changing the separate CLI `transcribe` tool's documented `base` default.

Executed offline using the injected process runner:

```sh
# From vanta-ts/
VANTA_TEST_VOICE=0 ./node_modules/.bin/vitest run src/voice/whisper-stt.test.ts
```

Before the fix: 2 failed, 9 passed, 1 live test skipped. After: 11 passed,
1 live test skipped. The failing cases showed configured `base` and `small`
being replaced by `tiny`; explicit override and empty/whitespace/unset fallback
are covered. The live opt-in is checked before probing Whisper, so this run
does not invoke the real executable or download weights. The changed production
file passed the explicit Vanta size gate. This is exact argument-selection
proof, not live audio, Desktop voice, model-manager or provider proof.

Final focused check: `VANTA_TEST_VOICE=0 ./node_modules/.bin/vitest run
src/voice/whisper-stt.test.ts src/voice/ptt-flow.test.ts` exited 0 with **14 passed,
2 live tests skipped**. `npm run typecheck` exited 0. No full suite was run.

Roadmap schema parsing, dependency/cycle validation and WIP checks executed:
**1,363 cards; 1,288 shipped history; 1 Building; 4 Next; 7 Horizon; 63 Parked**.
All previous shipped records remain byte-equivalent after JSON parsing.
`node --test scripts/roadmap-current-projection.test.mjs scripts/build-order.test.mjs`
exited 0 with seven passing checks. Generated `ROADMAP.md`, agent build order,
website roadmap and ignored local HTML were refreshed from canonical JSON;
`node scripts/roadmap-current-projection.mjs --check` exited 0.

Trello mirrors: [voice](https://trello.com/c/LCBYHGJZ),
[existing browser Next card](https://trello.com/c/R9lAOVhv), and
[priority/read-first card](https://trello.com/c/lI8Cirrr). The board readback
confirmed both additions as incomplete. No card was moved to shipped.

Publication targets the existing draft PR #60, not `main`. GitHub Actions remain
disabled. This increment is source/planning only: no new Desktop package,
installed-app replacement, CLI checkout update, release, tag or paid provider
request. The prior installed app remains available; the STT selection fix must
be included in the next validated build/update before installed behavior is
claimed.
