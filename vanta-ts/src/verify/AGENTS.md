# AGENTS.md — vanta-ts/src/verify

Verification primitives live here.

- `check.ts` / `store.ts` back regression locks: record a claim, command, and expected substring; re-run later to detect regressions.
- `completion-verifier.ts` is the opt-in `VANTA_VERIFY=1` post-turn completion checker.
- `visual-closeout.ts` generates `/verify` evidence requirements from changed files; UI changes require screenshot evidence, runtime code requires command/tool evidence, and docs-only changes require doc proof.
- Keep verifier calls best-effort; never let verification block or fail the main turn.
- Prefer pure helpers for trigger detection, evidence extraction, and verdict parsing.
- Visible user-facing verifier notes are emitted by lifecycle hooks, not by the verifier core.
