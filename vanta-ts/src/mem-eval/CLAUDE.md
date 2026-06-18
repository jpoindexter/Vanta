# CLAUDE.md — mem-eval

This folder owns memory-retrieval evaluation.

`corpus.ts` is the small fixture baseline. `public-loader.ts` maps public benchmark files into the same `MemoryRecord` / `MemQuestion` shapes. `run.ts` scores the fixture matrix; `public-run.ts` scores public datasets and embeds the fixture baseline in the result. `report.ts` and `public-report.ts` write ignored runtime artifacts under `.vanta/`.

Rules:
- No live model grading in the deterministic runner. If answer correctness is needed, expose it as a flagged live-model variant.
- Keep downloaded datasets out of git.
- Keep category mapping explicit and tested.
