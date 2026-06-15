# AGENTS.md — preferences

Local operator preference-signal capture. Parent context: `../../AGENTS.md`.

## Files

| File | Role |
|------|------|
| `signals.ts` | `~/.vanta/preferences.jsonl` JSONL store, zod row validation, context sanitizer, approval-decision signal factory, JSONL export |
| `signals.test.ts` | Store, corrupt-line skip, sanitizer, approval mapping, export coverage |

## Rules

- Store only compact chosen-vs-rejected pairs with provenance; do not store raw secret-bearing command text.
- Bad JSONL lines are skipped, not fatal.
- Signal writes are observational only. They must never decide whether a tool runs.
