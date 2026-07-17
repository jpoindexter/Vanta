# Local Model Download Queue

Date: 2026-07-17

Roadmap card: `LOCAL-MODEL-DOWNLOAD-QUEUE`

## Shipped Contract

Vanta now owns project-scoped local model acquisition as a durable queue rather than a blocking setup step.

- `vanta local-model downloads` exposes list, add, run, pause, resume, retry, and confirmation-gated cleanup.
- Hugging Face-compatible file URLs support optional vault-backed bearer-token references without persisting token values.
- Queue records persist exact bytes, destination, partial resume offset, failure classification, recovery copy, and profile linkage under `.vanta/model-downloads/`.
- Byte-range resume, expected-size enforcement, and SHA-256 verification reuse the first-inference downloader.
- Downloads paused by the operator remain paused; interrupted process records recover as paused after restart.
- Duplicate URL/checksum/destination requests return the existing queue item instead of starting a second transfer.
- Low disk, unresolved auth, offline/interrupted transfer, checksum mismatch, moved storage, and missing storage have explicit recovery states.
- Partial artifacts are removed only after an explicit confirmation action.
- A completed verified artifact updates the requested or selected runtime profile and writes a `profile_linked` receipt.
- Desktop Runtime now contains a compact Downloads disclosure with progress, destination, receipt time, pause/resume/retry, cleanup confirmation, profile handoff, and progressively disclosed storage/auth fields.

## Executed Proof

- Focused queue, CLI, API, renderer, first-inference, and profile tests pass.
- Both TypeScript typechecks pass.
- The module-size gate passes for all new queue, CLI, API, and renderer modules.
- A real `vanta local-model downloads add ... --start --json` child process downloaded from a local HTTP fixture into a temporary project, verified SHA-256, persisted five receipts, and produced a byte-identical artifact.
- The source Electron Runtime smoke passes in dark, light, and `760px` compact layouts. It exercises progress, resume, confirmation-gated cleanup, profile linkage, advanced-field disclosure, keyboard close, and horizontal-overflow checks.
- The full 16-flow source and Developer ID-signed packaged-app matrix passed, including progress, resume, cleanup confirmation, profile linkage, and progressive disclosure in both runtimes.
- The full repository suite passed: 1,403 test files and 13,340 tests passed, with three existing skips.

## Boundaries

- Vanta accepts a trusted expected SHA-256 or manifest-provided SHA-256; it does not infer trust from a filename or reachable host.
- The queue downloads individual model artifacts. Multi-file repository snapshots and dependency graph installation are outside this v1 card.
- Vault secrets must be granted to `model-download:<job-id>` before an authenticated transfer can start.
- Completed artifacts are not auto-launched. Runtime launch remains a separate kernel-gated operator action.
