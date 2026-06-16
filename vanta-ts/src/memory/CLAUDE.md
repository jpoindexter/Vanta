# CLAUDE.md — vanta-ts/src/memory

Memory-layer helpers. The structured brain lives in `../brain/`; this folder provides session memory, relevance/freshness utilities, curation, and guardrails.

- `guardrails.ts`: `guardMemoryRecall()` marks recalled entries usable only when fresh, non-conflicting, and sufficiently provenanced. Stale/conflicting/weak-provenance entries are hypotheses, not action evidence.
- `extractor.ts`: `runMemoryExtractor()` is gated by `VANTA_EXTRACT_MEMORIES=1`; it reads the recent user/assistant tail, asks for a JSON string array, dedups by >=80% candidate-word overlap, and persists new `semantic` brain facts with `auto-extracted` provenance.
- `store.ts`: per-goal markdown summaries under `~/.vanta/memories/`.
- `session-memory.ts`: live scratchpad injected back after compaction.
- `working.ts`: `SessionWorkingMemory` — session-scoped working memory (resets each session, accumulates during).
- `forget.ts`: TTL-based decay + footprint reporting over stored memories.
- `playbook.ts`: append/read saved "plays" (`Play` zod rows, tolerant reader).
- `freshness.ts`, `relevance.ts`, `curator.ts`, `archive.ts`, `compress.ts`: pure helpers with co-located tests.

Invariant: memory can guide attention, but current-state verification is required before risky or write-side tool calls.
