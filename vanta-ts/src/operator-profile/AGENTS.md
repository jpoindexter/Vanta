# AGENTS.md — `src/operator-profile`

Durable operator model. This layer keeps coarse declared/inferred profile settings separate from explicit evidence-backed beliefs, and exposes a tighten-only approval preference helper for the permission gate.

## Files

| File | Role |
|------|------|
| `profile.ts` | Zod schemas, `~/.vanta/operator-profile.json` read/write, inference, drift detection, approval preference decisions. |
| `profile.test.ts` | Store fallback/round-trip, inference/drift, and one-way-door preference safety tests. |
| `beliefs.ts` | Versioned `~/.vanta/operator-beliefs.json` store, provenance, status, support/revise/reject lifecycle. |
| `dialectic.ts` | Gated post-turn formation/revision pass; direct self-reports are authoritative and accepted without an LLM. |
| `behavior.ts` | Active-belief prompt block and deterministic response-policy cues/eval. |

## Rules

- Preferences never loosen the kernel floor. Kernel Block remains Block.
- One-way-door actions always ask unless already blocked.
- `never_ask` only preserves an already-allowed decision; it does not bypass Ask.
- Accepted self-reports cannot be overwritten by observational inference; a direct correction or `/preferences correct|reject` is required.
- Every belief mutation carries source/quote/time provenance and preserves superseded claims.
- Rejected beliefs and hypotheses below 55% confidence never enter the prompt.
- Beliefs are local; preference-pair training data remains in `PREFERENCE-SIGNALS`.
