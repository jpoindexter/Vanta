# AGENTS.md — vanta-ts/src/compress

Native context-compression helpers for tool output, persistent conversation compaction support, CCR retrieval, and post-compaction context restoration.

- `apply.ts`: tool-output compression allowlist + CCR footer wiring (`applyCompression`), plus `applyCodeCompression` (AST body-elision for read_file TS/JS source).
- `router.ts`, `json-crush.ts`, `log-squash.ts`: content classifier + lossy compressors for the allowlisted tools.
- `ast-compress.ts`: AST-based TS/JS compressor — elides function/method bodies, keeps imports/types/signatures (`isCodeContent`, `compressTypeScript`). Pure.
- `store.ts`, `result-offload.ts`: CCR stash/retrieve and oversized result offload.
- `reactive.ts`: detects tool results over 40% of the context window and trims them before the next model turn.
- `post-compact-restore.ts`: after persistent conversation compaction, restores bounded recently edited file snippets plus active skill bodies as a system injection.
- Tests are co-located; keep compression best-effort so failures never block the agent loop.

Integration points: persistent conversation compaction is invoked from `../agent/context-pipeline.ts`; reactive tool-result trimming is invoked from `../agent.ts`.
