# Durable Home drafts — source checkpoint, 2026-10-27

## Delivery and proof limits first

This is source integration, not a new installed app, full redesign or completed
continuity/security acceptance. Installed archive2/code `2d31393f` predates this
repair. Owner visual/per-item parity, live accounts, physical dialogs, auxiliary
windows and unfamiliar-person acceptance retain their independent gates.

## Behavior and preservation

Home now saves plain words, selected project and revision in the existing
owner/window-scoped draft store before a handoff. Quitting before Attach or
Send confirmation recovers those words without replaying either action.
The existing native project-confirmation and file/image picker remain in use.
Source metadata never becomes prompt text or a chat-history title.

Fresh attachment text must be saved and its fresh handle remembered before the
matching Home source can be consumed. Newer Home or destination edits survive.
Corrupt/unavailable storage refuses the action visibly without replacing bytes.
At the existing 50-record capacity, Home refuses a new source/text destination
rather than evict an older saved draft; empty/image-only destinations do not
unnecessarily allocate a text slot. Generic retention policy is unchanged.

Repeated Send/Attach callbacks share the actual pending action before saving
anything, protecting newer edits from stale callbacks. Buttons/project choice
and Enter follow that pending state. Immediately before actual submission, a
durable marker distinguishes possibly-sent work from ordinary unsent text.
Unknown outcome never triggers automatic retry. Accepted send with failed source
cleanup reports **Message accepted / Do not send it again**. On restart, an
unresolved marker asks the person to check chats; it is not an acceptance receipt.

The shared text-consumption API now reports failed persistence and restores its
memory text/revision/title/Undo state. Its boolean contract and the ordinary
stash API's void contract remain; legacy Quick Entry keeps its existing path.

An actual cold-Home replay exposed stale readiness despite a valid connection.
Home now uses the existing reactive owner selector instead of a hidden mutable
getter in rendering. No guessed owner, new loading screen, permission relaxation
or automatic model request was introduced.

## Parent-executed current-source evidence

- All 31 integrated source/test postimages match the frozen reviewed packet.
  All 31 have zero strict size findings; the oversized session-actions index
  stays byte-identical. This is cohesive extraction, not complete modularization.
- 94 selected renderer/store/caller tests in 17 files and 28 native-handler tests
  in three files pass. Renderer/Electron typechecks, sequential renderer then
  main/preload builds, five architecture gates and the design scan pass.
- Current canonical source, Desktop Vite 8.3.3, actual Electron/runtime/kernel:
  13 native journey checks pass across three quit/relaunch cycles, a project
  reload and a renderer reload. Cold Home works without first clicking New chat.
- The journey holds the real native confirmation before Attach and before Send,
  quits, and recovers exact words plus Bravo selection with zero automatic model
  calls. Repeated Enter cannot duplicate the pending handoff. A recovered Attach
  switches the actual runtime to Bravo, cancels the picker and retains its draft.
- Two later explicit sends produce exactly two plain-text loopback requests:
  the recovered fresh draft, then ordinary Home Send. Accepted Home Send clears
  its saved source. All renderer lifetimes report zero errors.
- A separate current-source image regression passes 11 checks: project/native
  root agreement, exact selected PNG on first send, cancel, text cold recovery,
  image-only cold recovery/reload, exact retained PNG on explicit send, and both
  original project briefs unchanged. Three deliberate model requests, zero
  renderer errors. Combined: 24 executed checks across two bounded journeys.

The final OS dialog responses are controlled fixtures, while application handlers,
storage, runtime, kernel and model transport are real. These are private-profile
loopback-model checks, not owner-state, live-provider or physical-dialog proof.
Source tests exercise ambiguous outcomes and accepted-send cleanup-write failure;
those failure injections were not executed through the native app.

Exact preimages, final source manifest, parent logs/results and screenshots are
retained in `home-durable-parent-20261027-FhHVB8`. The frozen proposal and earlier
failures/reviewer receipts remain in `home-durable-20261027-ZVVjdA`; its private
native r2 used earlier bytes/dependencies and is not substituted for this final
canonical run. Patch SHA-256:
`fae0547aab068081ed44817fcd1d8ae326da58d2830ea1ef4729f6d8bba9c7c4`.
Image regression evidence is separately retained as `source-r5-durable` in
`home-cross-project-20261027-wNYbF0`, with its parent log in the new packet.

No full suite, packaged/installed proof, concurrent multi-window storage proof,
full visual sign-off, public release or roadmap-card closure is claimed.
