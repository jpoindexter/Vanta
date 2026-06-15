# AGENTS.md — vanta-ts/src/desktop

Local command-center surface for Vanta.

- Keep this as a thin UI host over existing Vanta runtime primitives (`prepareRun`, `createConversation`, `SafetyClient`).
- Do not bypass the kernel; all agent work must still flow through the normal conversation/tool dispatch path.
- Headless browser approvals are not implemented yet: desktop requests currently deny risky/ask actions instead of pretending approval happened.
- `server.ts` hosts HTTP/API. `assets.ts` serves the built React app from `vanta-ts/desktop-app/dist`; `page.ts` is only the no-build fallback notice.
- `approval.ts` owns the pending approval payload/decision adapter for desktop; server routes stay thin.
- Browser UI code lives in `vanta-ts/desktop-app/`; do not import Vanta runtime modules into that app.
