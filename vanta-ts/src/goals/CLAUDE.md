# CLAUDE.md — goals

Goal dependency graph support.

- Store: `.vanta/goal-deps.json` with `{version:1, edges:[{blockerId, dependentId}]}`.
- `buildGoalGraph()` derives displayed state: active kernel goals with unfinished blockers render as `blocked`.
- `wakingDependents()` returns active dependents whose final blocker just completed.

The Rust kernel remains the fixed goal ledger; this layer adds graph semantics without changing kernel storage.
