# AGENTS.md — src/ui/v2

TUI v2 is the opt-in mission-control surface. Keep this folder separate from the working v1 TUI in `src/ui/*.tsx`; v2 may import v1 read-only, but do not move or rewrite v1 behavior here.

Launch contract: `VANTA_TUI=v2` selects this surface, default/unknown values stay on v1.

Tests live beside the component. Prefer pure frame/component tests here; launcher selection tests stay in `src/ui/launch.test.ts`.
