# AGENTS.md — vanta-ts/src/compress

Native context-compression helpers for tool output, persistent conversation compaction support, CCR retrieval, and post-compaction context restoration.

- `apply.ts`: tool-output compression allowlist and CCR footer wiring.
- `router.ts`, `json-crush.ts`, `log-squash.ts`, `ast-compress.ts`: content classifiers and lossy compressors.
- `store.ts`, `result-offload.ts`: CCR stash/retrieve and oversized result offload.
- `post-compact-restore.ts`: after persistent conversation compaction, restores bounded recently edited file snippets plus active skill bodies as a system injection.
- Tests are co-located; keep compression best-effort so failures never block the agent loop.

Integration point: persistent conversation compaction is invoked from `../agent/context-pipeline.ts`.
