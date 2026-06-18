# AGENTS.md — vanta-ts/src/meta-tune

Meta-tuning for Vanta's bounded instruction surface.

- `PROGRAM.md` is the tracked tunable block consumed by the system prompt.
- Candidate programs are scored through the existing eval runner; pass@1 is primary, CNG is a token-efficiency tie-breaker.
- Adoption must be explicit and approval-gated. A run may record the best variant without overwriting `PROGRAM.md`.
- Tests must inject eval, approval, and file-write seams; do not run live models.
