# AGENTS.md — vanta-ts/src/mem-eval

Memory-retrieval benchmark code.

- Keep loaders tolerant at the file boundary, then validate with Zod before producing internal records.
- Keep scoring deterministic: retrieval hit-rate against evidence ids, not answer correctness.
- Do not commit downloaded benchmark datasets; use `.vanta/` runtime paths for data and result JSON.
- Reuse the existing retriever port in `retrievers.ts` so fixture and public benchmarks measure the same behavior.
- Add tests with tiny synthetic benchmark-shaped files; CI must not depend on network or model downloads.
