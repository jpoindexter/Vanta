# AGENTS.md — `src/operator-profile`

Durable operator preference model. This layer stores declared preferences separately from inferred behavior and exposes a tighten-only approval preference helper for the permission gate.

## Files

| File | Role |
|------|------|
| `profile.ts` | Zod schemas, `~/.vanta/operator-profile.json` read/write, inference, drift detection, approval preference decisions. |
| `profile.test.ts` | Store fallback/round-trip, inference/drift, and one-way-door preference safety tests. |

## Rules

- Preferences never loosen the kernel floor. Kernel Block remains Block.
- One-way-door actions always ask unless already blocked.
- `never_ask` only preserves an already-allowed decision; it does not bypass Ask.
- Keep inference v1 signal-based and local; broader preference-pair capture belongs to `PREFERENCE-SIGNALS`.
