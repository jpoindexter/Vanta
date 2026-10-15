# AGENTS.md — vanta-ts/src/memory

Session memory helpers outside the structured brain store.

- `guardrails.ts` classifies recalled brain entries before they can drive action: freshness, conflict, and provenance. Flagged memories are shown as "not used" and require current-state verification.
- `extractor.ts` is the opt-in `VANTA_EXTRACT_MEMORIES=1` post-turn fact extractor: one cheap provider call, JSON array only, 20s timeout, dedup against stored brain entries, writes `semantic` facts with `auto-extracted` provenance.
- `msa-protocol.ts`, `msa-client.ts`, and `msa-provider.ts` define the optional Memory Sparse Attention service boundary. Vanta stays TypeScript/Rust; local memory remains authoritative; remote responses are schema-validated and control-stripped; failures fall back locally.
- Existing memory modules (`store.ts`, `session-memory.ts`, `working.ts`, `forget.ts`, `playbook.ts`, relevance/freshness/curator/archive/compress helpers) stay file-backed and best-effort.
- Tests in this folder should be pure/table-like; tool integration belongs in `../tools/brain.ts` tests or agent-loop tests.
