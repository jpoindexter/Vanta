# Local model first-inference wizard

**Roadmap:** `LOCAL-MODEL-FIRST-INFERENCE-WIZARD`  
**Implemented:** 2026-07-17

## Outcome

`vanta local-model setup` now takes a supported Apple Silicon Mac from hardware detection to one useful result through Vanta's managed runtime boundary. The command reports architecture, memory, free disk, the recommended model and storage requirement, and the exact `llama-server` command before network or process work begins. `--yes` is an explicit non-interactive approval; otherwise ask-tier kernel decisions use one operator confirmation that covers the verified download and launch.

The built-in profile is Qwen 2.5 0.5B Instruct Q4_K_M from the official Qwen Hugging Face repository. Its manifest pins 491,400,032 bytes and SHA-256 `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db`. Operators can provide a different checksum-pinned GGUF with `--model-id`, `--model-url`, `--sha256`, `--bytes`, `--filename`, and `--context`.

## Durable flow

The implementation in `vanta-ts/src/first-inference/` separates four bounded contracts:

1. hardware detection records only compatibility facts, never serial number, UUID, hostname, or username;
2. storage preflight reserves download headroom and rejects low-disk or insufficient-memory starts;
3. the downloader resumes `.part` files with HTTP Range, streams rather than buffering the model, verifies exact size and SHA-256, and atomically publishes a mode-`0600` file;
4. the wizard checkpoints each transition, recovers an already-running managed runtime after restart, runs the lifecycle benchmark/provider proof, then asks the model for one concrete next action and stores only response hash, character count, and latency.

Failures resolve to stable codes such as `low_disk`, `unsupported_platform`, `runtime_missing`, `offline_download`, `checksum_mismatch`, `cancelled`, and the runtime lifecycle failure code. Retrying the same command reuses the partial model or valid completed artifact and the persisted runtime state.

## Executed proof

The direct proof ran the public command from a clean wizard state:

```bash
npm run vanta -- local-model setup --yes --json --port 8129
```

Observed behavior:

- detected macOS ARM64, 48 GiB memory, and sufficient free disk without machine identifiers;
- downloaded the 491,400,032-byte official Qwen artifact;
- independently recomputed the pinned SHA-256 exactly;
- launched Homebrew `llama-server` 9960 on loopback;
- received healthy status, exact runtime benchmark, and exact provider-turn proof;
- produced a 247-character concrete task-organizing answer in 188 ms;
- persisted a `done` checkpoint and redacted receipt chain;
- stopped the managed runtime and confirmed no listener remained on port 8129.

## Verification ledger

Executed:

```bash
npx vitest run src/first-inference src/runtime-engine src/cli/local-model-cmd.test.ts --maxWorkers=1
npm run typecheck
npm run vanta -- lint src/first-inference src/cli/local-model-cmd.ts src/cli/commands-table.ts src/cli/usage.ts
npm run vanta -- local-model status --json
```

The focused suite passes 22 tests across the clean flow, custom model selection, partial Range resume, checksum verification, offline transport, cancellation and retry, low disk, unsupported hardware, failed launch, running-runtime recovery, approval decline, redacted receipts, and lifecycle stop/recovery behavior. Core TypeScript and Vanta's file/function/complexity gate pass.

The direct proof establishes one real llama.cpp/Qwen path on this Mac. It does not establish other Mac architectures, MLX, Windows/Linux, or larger-model quality; those require separate runtime profiles and acceptance evidence.
