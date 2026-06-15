# AGENTS.md — `src/ralph`

Durable Ralph-loop continuity for long-running work. This layer owns project-scoped state in `.vanta/ralph-loop.json`; startup/session code only reads formatted paused continuity from here.

## Files

| File | Role |
|------|------|
| `state.ts` | Zod-validated Ralph state read/write, next-feature selection, feature status updates, paused continuity formatting. |
| `state.test.ts` | Disk round-trip, malformed/missing file behavior, next-feature selection, status updates, and paused block formatting. |

## Rules

- Treat `.vanta/ralph-loop.json` as durable project state, not transcript memory.
- Startup continuity must be PAUSED. Do not generate active instructions from this module unless `/goal resume` explicitly requests it.
- Preserve feature order; it encodes priority.
- Keep imports dependency-light: Node stdlib + `zod` only.
