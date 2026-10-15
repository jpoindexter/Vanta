# Goal: Vanta Desktop Next, Slice 1 first

Owner direction (2026-10-13): work through every DN card; report when the desktop app is done and the issues are fixed.

## Done criterion (one sentence, executed not inferred)
A user opens the packaged `desktop-next` Electron app, starts a chat in a project, sees live tool steps, gets an exact-action
approval, picks Always allow, restarts the app, starts a new chat in the same project and is NOT asked again; a different
project still asks; the composer never freezes; the window collapses per the approved wireframe at 1440/1200/900.

Nothing is "done" until DN-13 executes that path in the real Electron app. Slices 2 and 3 are tracked but only claimed
when their own proofs run.

## Order (dependency, not preference)
1. DN-06 server: typed SSE events (tool id/args/result, approval push, turn complete) + sessionId on chat. Additive.
2. DN-01 theme: review designer WIP, commit scoped or discard; Vanta skin default.
3. DN-11 brand: strip Hermes/Nous; DN-07 bridge facade; DN-06 renderer `VantaGateway`.
4. DN-02 shell chrome, DN-03 chat surface, DN-12 approvals.
5. DN-13 proofs and gates (flake rate N=20 reported).
6. Slice 2 (DN-05, 04, 08, 09), Slice 3 (DN-10, 14), DN-DEP.

## Corrections to earlier assumptions (found by reading the server, 2026-10-13)
- The server already keeps state PER CLIENT: `x-session-id` header or `?session=` selects a `DesktopState`
  (`session-state.ts`, `getSession`). The "singleton" is per client id, not global. Parallel chats need no server rewrite:
  the renderer sends a distinct id per chat. DN-10's "remove singleton" scope shrinks to renderer behaviour + tests.
- `tool_start` already carries `args` inside the agent (`StreamEvent`); the label formatter drops them, and there is no tool id.
  Typed events are an additive field on `DesktopEvent`.
- Approvals are exposed only by polling `GET /api/approval`; nothing is pushed on SSE.
- Chat POST returns the whole turn at the end: `{finalText, events, usage, sessionId, receipt}`; live progress is SSE only.
- `POST /api/chat` rejects a body `sessionId` that differs from the client state's open session (409).

## Boundaries
No Rust kernel or factory paths. No dependency bumps mixed with feature work. No notarize/publish. Installed app untouched.
