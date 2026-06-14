# CLAUDE.md — src/ui

The TUI uses React + Ink 7 with inline rendering and `<Static>` scrollback. Tests use `test-render.tsx` with fake stdio.

Default surface:
- v1: `app.tsx`, selected by default.
- v2: `v2/`, selected only by `VANTA_TUI=v2`.

When adding UI behavior, prefer pure helpers and co-located tests. Do not use `ink-testing-library`; use the existing real-Ink harness.
