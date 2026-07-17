# Local runtime engine lifecycle

**Roadmap:** `LOCAL-RUNTIME-ENGINE-LIFECYCLE`  
**Implemented:** 2026-07-17

## Outcome

Vanta now owns the process lifecycle for local inference instead of treating an OpenAI-compatible URL as proof that a model is ready. The lifecycle manager in `vanta-ts/src/runtime-engine/` previews an exact backend command and resource estimate, asks the kernel to assess the launch, applies the configured approval callback, starts the process, waits on bounded health, runs a deterministic benchmark, proves one provider-compatible turn, and records each transition before returning a running runtime.

Supported profiles are explicit:

- `llama_cpp` and `mlx` are launchable local profiles;
- `vllm` and `sglang` implement the same contract as remote fixtures but remain `contract_only` until a live remote proof ships;
- resource estimates reject obviously undersized hosts before process launch;
- persisted state is mode `0600`, while receipts contain a command hash and bounded metrics rather than command arguments, model paths, prompts, responses, or raw errors.

## Failure and recovery policy

Downstream benchmark/provider failures have an explicit policy: stop the process by default or retain it only when the launch specification requested retention. Restart recovery checks the persisted PID and health endpoint, restores a live runtime to `running`, and classifies missing or unhealthy processes as `stale` with redacted receipts. Stop always emits `stopping` and `stopped` transitions.

The kernel client factory also accepts an explicit root for API-token discovery. This prevents a nested package token from being sent to a parent-rooted kernel, which was caught during the live proof.

## Executed direct proof

The proof used the installed Homebrew `llama-server` and an existing local Qwen 2.5 14B GGUF. No model was downloaded. The actual path executed:

1. kernel assessment and explicit bounded approval;
2. `llama-server` process launch on loopback;
3. health readiness after approximately 14 seconds;
4. exact deterministic response `VANTA_RUNTIME_OK` in 666 ms / 5 output tokens;
5. OpenAI-compatible provider response `VANTA_PROVIDER_OK` in 498 ms;
6. redacted receipt transitions from `previewed` through `running`;
7. `stopping` and `stopped` receipts, followed by confirmation that no process remained on the proof port.

## Verification

Executed:

```bash
npx vitest run src/kernel/client.test.ts src/runtime-engine --maxWorkers=1
env VANTA_RUNTIME_MODEL=<existing-gguf> VANTA_RUNTIME_APPROVE=1 VANTA_RUNTIME_PORT=8899 node --import tsx scripts/runtime-engine-live-proof.ts
lsof -nP -iTCP:8899 -sTCP:LISTEN
npm run typecheck
```

Twelve focused tests pass across profile construction, approval/block behavior, launch/health/benchmark/provider flow, resource rejection, stop-versus-retain policy, restart recovery, transition redaction, remote contract-only gating, and root-explicit kernel credentials.

This proves one real direct llama.cpp lifecycle plus deterministic MLX, vLLM, and SGLang contract fixtures. It does not claim a live MLX launch or live remote vLLM/SGLang deployment; those remain separate provider/runtime proofs.
