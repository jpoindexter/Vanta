# CLAUDE.md — vanta-ts/src/compress

Compression layer for reducing context pressure without breaking the agent loop.

- Tool-result compression is opt-in by tool name in `apply.ts`; precision reads stay uncompressed.
- Persistent conversation compaction is owned by `../context.ts` and `../agent/context-pipeline.ts`; this folder supplies restore/offload helpers.
- `post-compact-restore.ts` is best-effort: reads the session working set, bounds files to 5 files × 5 KB, bounds skill bodies to 25 KB total, and emits one markdown system block.
- Never make compression mandatory for correctness. If a read, parse, CCR write, or restore fails, return the smaller safe surface or nothing.

Run focused checks from `vanta-ts/`:

```bash
npx vitest run src/compress/post-compact-restore.test.ts
npx vitest run src/compress
```
