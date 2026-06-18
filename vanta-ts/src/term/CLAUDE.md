# CLAUDE.md — vanta-ts/src/term

Terminal helper layer.

- `notify.ts`: terminal bell + optional `osascript` notification (`VANTA_NOTIFY=1|true`). When `dataDir` is supplied, it also emits hook event `Notification` with `notificationType` as matcher value.
- Composer, model-switch, tool-display, and token helpers are pure/tested utilities used by both readline and Ink.
- No theme system lives here; see DECISIONS 2026-06-17.
