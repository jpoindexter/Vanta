# AGENTS.md — vanta-ts/src/term

Terminal-only presentation helpers shared by readline and Ink surfaces.

- `notify.ts` rings the bell, optionally posts macOS notifications, and fires `.vanta/hooks.json` `Notification` hooks when a caller supplies `dataDir`.
- Keep helpers pure or dependency-injected where possible; tests should use fake writers/stdio.
- Do not reintroduce the removed theme system; UI color stays terminal-native and local to components.
