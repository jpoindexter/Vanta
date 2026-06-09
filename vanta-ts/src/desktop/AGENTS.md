# AGENTS.md — vanta-ts/src/desktop

Local command-center surface for Vanta.

- Keep this as a thin UI host over existing Vanta runtime primitives (`prepareRun`, `createConversation`, `SafetyClient`).
- Do not bypass the kernel; all agent work must still flow through the normal conversation/tool dispatch path.
- Headless browser approvals are not implemented yet: desktop requests currently deny risky/ask actions instead of pretending approval happened.
- Prefer small files: `server.ts` hosts HTTP/API, `page.ts` owns the static HTML/CSS/JS shell.
