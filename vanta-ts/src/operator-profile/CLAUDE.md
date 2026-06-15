# CLAUDE.md — `src/operator-profile`

Operator profile v1 lives at `~/.vanta/operator-profile.json`.

## Contract

- `declared` and `inferred` profiles are separate.
- Missing/corrupt/invalid profile loads `defaultOperatorProfile()`.
- `inferProfileFromSignals()` is intentionally small: approval/denial signals infer coarse autonomy, scope, and risk preferences.
- `detectProfileDrift()` returns one-line mismatch messages.
- `approvalPreferenceFor()` is tighten-only: `always_ask` can escalate, `never_ask` cannot de-escalate Ask/Block, and one-way doors always ask.

Wiring: `agent/dispatch-helpers.ts` applies this after kernel + permission rules + auto-mode.
