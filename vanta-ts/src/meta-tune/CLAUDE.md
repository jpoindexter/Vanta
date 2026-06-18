# CLAUDE.md — meta-tune

This folder owns `vanta meta-tune instructions`.

`loop.ts` reads the current `PROGRAM.md`, creates bounded one-line variants, scores each variant through an injected eval, records the best result, and writes the program only when `--adopt` is approved. `score.ts` keeps pass@1 primary and uses CNG as an output-token efficiency tie-breaker. `record.ts` writes `.vanta/meta-tune-instructions.json`.

Keep this layer pure and injectable. It should never edit protected kernel or factory files.
