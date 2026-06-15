# AGENTS.md — src/ui

Ink 7 TUI surface. The existing `app.tsx` path is the default v1 UI and should stay stable unless a task explicitly targets it.

`src/ui/v2/` is the opt-in mission-control surface selected by `VANTA_TUI=v2`. Keep launch selection small and testable in `launch.tsx`; keep layout-specific v2 code in `v2/`.

Approval UI (`approval-prompt.tsx`) renders typed request context from `../permissions/request.ts` and four decisions: allow once, always allow, deny, never allow.
