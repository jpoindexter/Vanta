# AGENTS.md — vanta-ts/src/memory

Session memory helpers outside the structured brain store.

- `guardrails.ts` classifies recalled brain entries before they can drive action: freshness, conflict, and provenance. Flagged memories are shown as "not used" and require current-state verification.
- Existing memory modules (`store.ts`, `session-memory.ts`, relevance/freshness/curator/archive helpers) stay file-backed and best-effort.
- Tests in this folder should be pure/table-like; tool integration belongs in `../tools/brain.ts` tests or agent-loop tests.
