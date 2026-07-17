# Local runtime v1 release gate

Date: 2026-07-17

Roadmap card: `LOCAL-RUNTIME-V1-RELEASE-GATE`

## Outcome

Vanta completed the Local Runtime v1 release path on a clean temporary project with a real Qwen 2.5 14B GGUF model. The proof used Vanta's hardware detector, durable model-download queue, SHA-256 verification, selected runtime profile, kernel-gated lifecycle manager, local OpenAI-compatible provider route, coding tools, route usage ledger, resource usage ledger, and recovery receipts.

The coding task was executed through the real `vanta run` entry point. Vanta read the fixture instructions and source, edited `normalizeTitle`, ran the provided Node test, and produced `local-runtime-coding-proof: passed`.

## Executed runtime proof

```bash
VANTA_LOCAL_RUNTIME_MODEL_SOURCE=/Users/jasonpoindexter/.ollama/models/blobs/sha256-2049f5674b1e92b4464e5729975c9689fcfbf0b0e4443ccf10b5339f370f9a54 \
VANTA_LOCAL_RUNTIME_MODEL_SHA256=2049f5674b1e92b4464e5729975c9689fcfbf0b0e4443ccf10b5339f370f9a54 \
VANTA_LOCAL_RUNTIME_APPROVE=1 \
npm run local-runtime:v1:proof
```

Observed receipt:

- Host: Darwin ARM64 with 51,539,607,552 bytes of memory.
- Artifact: 8,988,110,688 bytes; trusted and downloaded SHA-256 both matched `2049f5674b1e92b4464e5729975c9689fcfbf0b0e4443ccf10b5339f370f9a54`.
- Profile: 32,768-token context, one parallel sequence, compatible and round-trip stable.
- Runtime: approved, started, health-checked, benchmarked, provider-turn verified, and running.
- Benchmark: 554 ms launch verification latency and five output tokens.
- Task: real file edit plus `node title.test.js`, passed.
- Usage: four route calls and four resource calls joined by call ID.
- Recovery: retain-after-failure, stop-after-failure, and retry-to-running all passed.

The proof copies the already trusted local artifact through a bounded loopback HTTP endpoint so the actual queue, resume, byte-count, and checksum path executes without an external dependency. This proves Vanta's transfer and verification behavior. It does not prove that a public model URL remains available or that a fresh external download succeeds.

The small 0.5B onboarding model was also evaluated and did not reliably complete the coding edit. The release proof therefore uses the real 14B coding model. Local sessions now receive the bounded coding tool set, a compact project prompt, a 512-token default completion cap, and explicit environment overrides for operators who need the full prompt, full tools, or a different token cap.

## Executed desktop proof

```bash
npm run desktop:flow:proof
npm run desktop:kernel-collision:smoke
npm run desktop:renderer:typecheck
npm run typecheck
npm test
git diff --check
```

The Developer ID-signed packaged ARM64 application and source Electron target both passed cold start, useful work, failed-run recovery, queued turns, prompt navigation, restart restoration, attachments, session operations, Outputs, Connect, runtime launch/stop/reconnect, dark and light Ghost themes, compact layout, keyboard operation, 200% zoom, and offline/reconnect draft preservation.

The project-collision smoke preserved the existing kernel owner and launched a second packaged project on a free endpoint. The complete suite passed 1,408 test files and 13,359 tests, with three intentional skips.

## Claim ledger

- Executed: the full local runtime proof, signed packaged/source desktop matrix, collision smoke, typechecks, complete test suite, and diff check.
- Code-path only: public remote model hosting and network-specific download behavior.
- Not established: a fresh internet download, Intel Mac behavior, notarized DMG distribution, or performance on lower-memory hardware.
