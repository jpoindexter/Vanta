# Pending draft ownership — isolated source checkpoint

## Delivery boundary

This continues [the captured-owner candidate](DRAFT-OWNER-CANDIDATE-2026-10-26.md).
Application changes remain in the external `draft-pending-20261026-vbz1Cd`
candidate. They are not promoted to the integration source or installed app.
The installed `71cf90cf` bundle remains unchanged. The full Desktop/recovery
goal and recovery card stay open; no owner visual or parity gate is waived.

## Changes in the candidate

- Unresolved composer ownership now makes input, paste/drop and external
  insertion unavailable, with one localized inline status. It does not read or
  write an unowned legacy draft. Resolving ownership loads only that owner's
  text. The nine bundled locale catalogs include the status.
- First-session ownership follows a unique recorded owner even while the
  ambient connection still describes the previous backend. Matching scoped
  owners and explicit tile routes win; ambiguous unmatched owners refuse.
- Fresh-scope identity, saved draft state and lifecycle migration are extracted
  from the composer store with stable public exports. A narrow layout-effect
  hook retains pre-paint scope swaps and the cleanup's captured writer.
- Restored-tab row lookup and title backfill have separate modules. Absence
  cannot retire a tab holding owned or legacy unsent words or attachments;
  legacy text is not assigned to the tab's owner by this retention check.
- A narrow rich-editor component retains the native editor/ref/ARIA, paste,
  keyboard, IME commit and blur handlers, directive actions and hidden
  assistant-ui binding. No new style, dependency or visual treatment is added.
- A regression demonstrated that conclusive server absence could erase an
  owned unsent draft. Cleanup now clears only empty readable owned drafts;
  nonempty text and image-only drafts remain. This correction has focused
  execution, not successful full-app cleanup proof yet.

## Executed evidence

- **205 focused checks in 20 files pass**, covering the store, ownership,
  first-send restoration, existing draft/submit lifecycle, tile lookup,
  attachment ownership, editor/IME/paste and draft-title paths. An initial
  surrounding run failed 16 cases because fixtures had no owner or seeded the
  legacy namespace. Known-local fixtures now declare their owner; production
  refusal was not weakened. Dedicated unresolved/ambiguous-owner cases remain.
- The unsent-owned-text cleanup regression failed before the guard. The final
  cleanup cases include legacy text, image-only drafts and dead pins without
  payload. The earlier empty-draft fixture incorrectly expected a probe when
  stashing empty content creates no candidate; it now supplies an actual pin.
- Renderer typecheck and final renderer/main/preload builds exit zero. Existing
  large syntax-highlighter chunk and mixed static/dynamic import warnings
  remain. Native custody production code is unchanged; its focused suite and
  Electron typecheck were not rerun in this slice.
- Size ratchet: **64 production files, zero new/worse findings, 97 inherited**
  against the unchanged canonical baseline. All seven new production modules
  separately pass the strict file/function/complexity/parameter limits. This
  removes this candidate's prior size regressions, not the app's inherited debt.
- Exact final source Electron, private test home and loopback model:
  **11 corruption/restart checks pass**, with two requests and zero renderer
  errors. Invalid JSON/owner identities and failed Retry preserve exact text
  and PNG; valid recovery clears the warning; restart/history does not send;
  deliberate send delivers exact text and image once.
- A separate exact-source **six-check queue journey passes**, with two total
  requests and zero renderer errors: busy queue acknowledgement, same native
  queue ID across forced termination/restart, no replay, Edit/Cancel/Save
  preserving a separate draft and exact PNG, then one deliberate Send now.
- Two additional startup-cleanup attempts timed out waiting for orphan pins to
  disappear, both without renderer errors. They are retained as failures, not
  full-app cleanup passes. One began on an empty backend and one with ordinary
  chat history. Their exact reachability cause remains unproven. Do not remove
  profile/absence guards merely to force that proof through.

These use synthetic paste/storage events with real PNG bytes. They do not prove
OS clipboard, native cross-profile switching, concurrent windows, power loss,
live accounts, microphone or full accessibility/visual acceptance.

## Preserved artifacts and re-entry

External packet: `Vanta-backups/draft-pending-20261026-vbz1Cd/`.
`DRAFT-PENDING-APPLICATION-NOT-READY.patch` and its preimage/after-image manifest
are the combined candidate, not an incremental patch to stack on older packets.
The matching `freeze-receipt.json` binds the base and hashes. Before/after file
copies, logs, private proof receipts and canonical-doc pre-edit archive remain
there. Do not edit frozen candidate bytes; continue in a new editable copy.

Packet base: `f6b91c78279c929969e11a84039ac0896623d2a2`; 100 files,
396,152 bytes. Patch SHA-256:
`891d5b6256685a6878bc5c461bcd9534053ba5c6c29225be6f9b7d6466635eea`.
Manifest SHA-256:
`4cf8df1983ec190d5962b8276d2628ff17c39a957f3f63a6cd97f503f7b7bba1`.
Dry-run application succeeds against the unchanged application base; it was
not applied. Installed ASAR SHA-256 remains
`f65ba24021dc75f3d4eb6425a5f1dcce57d187a8345aaeda85c54134b80ae36b`.

Earlier packets and all 239 original dirty regular files remain preserved.
No test failure log is relabelled as acceptance. No app/profile installation,
main merge, release/tag, paid provider, CI or protected-source edit occurred.

Next engineering work: establish cleanup reachability without bypassing its
guards; offer explicit legacy recovery rather than silently adopting unowned
text; close native profile routing/persistence, fresh/GONE/HUD and concurrent
writer arbitration; review unknown-send recovery. Then promote bounded source,
package and execute the exact installed path with rollback. Pending broader
chrome still requires owner visual approval; wider parity and human gates stay
separate from source proof.
