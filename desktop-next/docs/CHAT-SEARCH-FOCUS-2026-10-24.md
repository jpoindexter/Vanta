# Chat search focus — 2026-10-24

## Criterion and cause

After clearing chat search with Enter, Space or mouse, focus must return to the
search input. Subsequent typing must update the query, never the unsent chat
draft; the current chat must remain selected and no message may be sent.

Baseline f0261f96 actual source Electron reproduced: Tab to Clear → Enter
removed the focused button, leaving focus on body. Typing Other then appended
to the chat's existing draft through the global type-to-focus behavior.
Cmd+K → Escape itself preserved the draft and was not changed.

## Change

SearchField's existing Clear action focuses its own input after its callback.
It uses the supplied input ref or a local fallback. Existing value control,
custom onClear, translated label, keyboard handler and loading/empty behavior
remain; no new control, shortcut, copy, dependency or search backend.

Caller review found the same primitive in sidebar, page/filter/overlay searches,
settings, logs, setup and plugin views. Fixing the shared owner avoids special
sidebar focus code and preserves existing custom key handlers. Tests cover
both ref forms and custom clear callbacks; no fixture/config/export changes.
Named design principles: stable keyboard ownership, predictable control states,
and reduced interaction overhead without new visible machinery.

## Executed evidence

- Both ref-form regressions failed before the fix. Exact-index candidate:
  6 focused tests / 1 file passed (including value reset, custom clear and
  empty/loading behavior).
- Source build passed: 339 runtime chunks. Candidate:
  Vanta-backups/chat-navigation-candidate-20261024-Rlgryp.
- Actual private-profile source Electron: 15 assertions, Enter/Space/mouse
  Clear → query typing, exact draft/route preserved, one local scripted model
  request total, zero renderer errors. Cmd+K/Escape also preserved the draft.
  Report/screenshot: `proofs/chat-search-focus-2026-10-24/`.
- Size ratchet: no new/worse violations. All five architecture boundaries,
  brand zero, design no increase, staged secret and diff checks pass.
- Renderer typecheck retains only the inherited missing
  `tests/fixtures/session-resume-active-turn.json`; not a green typecheck claim.

## Preservation and limits

Pre-edit source backup: Vanta-backups/chat-navigation-20261024-dO1hlb, verified
full-history branch bundle, binary dirty patch and untracked archive. All 273
pre-existing changed/untracked regular files remain byte-identical. Wider
design stays uncommitted; no normal-profile/account state, installation, merge,
PR edit, tag/release, Rust/factory change or approval-policy change.

No all-search-surface, installed app, VoiceOver or full redesign acceptance.
DN-13/22/29 remain open. Keyboard selection between chats remains the next
bounded navigation path; this Clear replay does not certify it.
