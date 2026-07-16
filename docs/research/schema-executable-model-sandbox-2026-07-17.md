# Schema Executable-Model Sandbox

Status: shipped 2026-07-17

## Outcome

Vanta can execute a generated `step(input)` transition and `isGoal(state)` predicate inside a model-only boundary that is stricter than the ordinary tool sandbox.

On macOS, each execution:

- creates a disposable workspace containing only the runner, model source, declared JSON input, and Seatbelt profile;
- launches the bundled Node runtime with an empty environment;
- denies network access and all writes outside the disposable workspace;
- re-denies the operator home and temporary trees after allowing system runtime reads;
- disables string and WebAssembly code generation and removes constructor-chain escape paths inside the VM;
- enforces bounded wall-clock time, V8 heap size, and captured output;
- executes twice and rejects different results for identical input;
- emits one redacted receipt with model hash, limits, duration, and terminal status.

Unsupported platforms return `sandbox_unavailable` and refuse to execute. There is no unsandboxed fallback.

## Executed Proof

Executed from `vanta-ts/` on macOS:

```text
npm test -- --run src/schema/model-sandbox.test.ts
1 file, 9 tests passed

npm test -- --run src/schema
5 files, 27 tests passed

npm run typecheck
passed
```

The live fixtures prove deterministic execution, constructor-chain escape refusal, undeclared secret-file refusal without disclosure, infinite-loop termination, nondeterminism rejection, immutable timeline input, heap-limit failure, and unsupported-platform refusal. The profile test proves network denial and disposable-workspace-only writes.

## Boundary

The strict backend currently uses macOS Seatbelt. Linux and Windows intentionally fail closed until equivalent kernel-backed profiles are implemented and tested. This sandbox executes a supplied model; it does not yet version, diff, compile, or expose an active task model to the operator. Those behaviors belong to `SCHEMA-EXECUTABLE-TASK-MODEL`.
