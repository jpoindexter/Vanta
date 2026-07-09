# CLAUDE.md — `src/operator-profile`

The coarse operator profile lives at `~/.vanta/operator-profile.json`. Dialectic v2 beliefs live separately at `~/.vanta/operator-beliefs.json`.

## Contract

- `declared` and `inferred` profiles are separate.
- Missing/corrupt/invalid profile loads `defaultOperatorProfile()`.
- `inferProfileFromSignals()` is intentionally small: approval/denial signals infer coarse autonomy, scope, and risk preferences.
- `detectProfileDrift()` returns one-line mismatch messages.
- `approvalPreferenceFor()` is tighten-only: `always_ask` can escalate, `never_ask` cannot de-escalate Ask/Block, and one-way doors always ask.
- Beliefs have `hypothesis|accepted|rejected|superseded` status, confidence, evidence quotes, and session/turn provenance.
- Direct self-reports become accepted without a model call. Periodic/correction passes may form or revise beliefs, but observational inference cannot replace an accepted self-report.
- `/preferences` is the inspection/correction surface. Active beliefs feed every new session through `beliefPromptBlock()` and deterministic behavior cues.

Wiring: `agent/dispatch-helpers.ts` applies this after kernel + permission rules + auto-mode.
