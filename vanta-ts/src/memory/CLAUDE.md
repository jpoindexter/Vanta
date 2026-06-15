# CLAUDE.md — vanta-ts/src/memory

Memory-layer helpers. The structured brain lives in `../brain/`; this folder provides session memory, relevance/freshness utilities, curation, and guardrails.

- `guardrails.ts`: `guardMemoryRecall()` marks recalled entries usable only when fresh, non-conflicting, and sufficiently provenanced. Stale/conflicting/weak-provenance entries are hypotheses, not action evidence.
- `store.ts`: per-goal markdown summaries under `~/.vanta/memories/`.
- `session-memory.ts`: live scratchpad injected back after compaction.
- `freshness.ts`, `relevance.ts`, `curator.ts`, `archive.ts`, `compress.ts`: pure helpers with co-located tests.

Invariant: memory can guide attention, but current-state verification is required before risky or write-side tool calls.
