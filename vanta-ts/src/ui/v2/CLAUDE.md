# CLAUDE.md — src/ui/v2

This folder contains the non-destructive TUI v2 mission-control surface.

Rules:
- Keep v2 opt-in until Jason promotes it.
- Reuse the existing app/agent engine read-only.
- Do not edit v1 TUI files for visual iteration; only the launcher may choose between v1 and v2.
- Keep rail components pure and testable with `src/ui/test-render.tsx`.
