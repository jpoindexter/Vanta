# AGENTS.md — vanta-ts/src/auto-research

User-facing unattended metric-improvement loop.

- Keep the loop objective and metric-driven; no subjective scoring in this layer.
- Candidate edits run in `.vanta/auto-research-worktrees`; main only changes when a committed candidate improves the metric.
- Tests must inject metric, worker, VCS, merge, and cleanup seams. Do not require a live model or mutate the real repo.
- Journal every iteration to `.vanta/auto-research-journal.jsonl`.
