# Local Runtime Profiles Proof

Date: 2026-07-17

Roadmap card: `LOCAL-RUNTIME-PROFILES`

## Shipped behavior

- Versioned project-scoped runtime profiles for llama.cpp, MLX, vLLM, and SGLang.
- Create, clone, validate, select, export, import, and v1-to-v2 migration contracts.
- Backend-safe defaults plus progressive advanced controls for performance, environment references, extra arguments, host compatibility, network review, contract-only review, and policy scope.
- Current-host compatibility and memory-fit validation before selection and again before desktop launch.
- Unknown arguments require explicit review; flags that disable a security boundary remain blocked.
- Sensitive environment values must use `secret://` references. Resolution occurs only at process launch and unresolved references fail as `secret_unresolved` rather than a misleading spawn failure.
- Generated command, environment, and resource evidence round-trip through the runtime lifecycle adapter without changing the command hash.
- Desktop Runtime tray provides searchable profiles, selected state, command/resource evidence, recovery copy, cloning, export/import, and required-first profile creation.

## Executed proof

- Focused contract/API/controller/UI suite: 24 tests passed.
- Secret-resolution and CLI host-selection regression suite: 11 tests passed.
- `npm run typecheck`: passed.
- `npm run desktop:renderer:typecheck`: passed.
- Module limits for the new contract, store, and CLI files: passed.
- Real CLI fixture: create, validate, clone, select, export, import, and list completed against two temporary project roots. Validation reported `roundTrip: true`, current memory fit, and a generated llama.cpp command containing reviewed performance and custom arguments.
- `npm run desktop:runtime-strip:smoke`: passed in Ghost dark, Ghost light, and `760x900` compact layouts. The renderer exercised profile search, selection, command/resource evidence, and progressive advanced disclosure without horizontal overflow.
- `npm run desktop:flow:proof`: passed all eight flows against both the source Electron app and the Developer ID-signed packaged app. The runtime-profile receipt reported search, selection, evidence, and progressive disclosure for both targets.
- Full repository suite: 1,399 test files passed; 13,330 tests passed and 3 environment-dependent tests skipped.

## Boundaries

This proves the profile lifecycle and packaged desktop interaction contract. It does not claim live vLLM/SGLang infrastructure; those backends remain contract-only and require explicit review. It also does not embed or expose secret values in profile files or receipts.
