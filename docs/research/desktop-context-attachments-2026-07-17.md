# Desktop context attachments

**Roadmap:** `DESKTOP-CONTEXT-ATTACHMENTS`
**Implemented:** 2026-07-17

## Outcome

The composer paperclip and empty-draft `@` shortcut now open a project-context picker instead of a raw path inventory. The picker uses repository evidence for **Changed by Vanta**, file modification time for **Recent**, and the active conversation for **Mentioned in this task**. Search queries the complete safe project index.

The desktop API respects `.gitignore` and removes credential-like files and private Vanta/system directories before returning context. Selecting a file adds a contained, removable composer chip and marks the picker row attached. Sending preserves Vanta's existing `@path` context syntax, so the shared context expansion path remains authoritative.

## Executed proof

Executed:

```bash
npm run typecheck
npm run desktop:renderer:typecheck
npx vitest run desktop-app/src --maxWorkers=1
npx vitest run src/desktop/file-context-api.test.ts src/desktop/file-context.test.ts src/desktop/server.test.ts src/term/at-context.test.ts --maxWorkers=1
npm run desktop:context:smoke
node scripts/desktop-layout-smoke.mjs
```

Observed:

- core and renderer TypeScript checks passed;
- 13 renderer test files and 38 tests passed;
- 34 backend context, server, and shared `@file` tests passed;
- all three new context modules passed Vanta's size and complexity gate;
- loopback API proof excluded `.env` and gitignored content from both file endpoints;
- Electron at 760 x 900 proved Changed, Mentioned, Recent, and Search project flows;
- Electron proved attach, attached state, removable chips, and exact submitted `@path` references;
- the file panel measured 419/419 client-to-scroll width and chips measured 706/706, with no horizontal overflow;
- the existing desktop layout smoke remained green after its fixture was isolated from operator sessions.

The Electron proof intercepts only deterministic file-context and chat responses. It runs the production renderer and desktop host with temporary project, profile, and Vanta-home locations, leaving operator state untouched.
