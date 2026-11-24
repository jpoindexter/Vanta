# Draft ownership — isolated candidate and corrected profile triage

## Status: application work remains external, not installed

Continue from [failed-read recovery](DRAFT-TEXT-RECOVERY-2026-10-25.md).
The previous 76-file candidate is preserved unchanged. The new owner-aware
candidate is not ready for promotion: unresolved-owner/legacy handling,
whole-profile native continuity and ten new/worse size findings remain open.
No recovery or design card is closed by these results.

## Application changes in the isolated copy

- Text, revisions and draft titles can address a captured connection, profile
  and raw session ID. The encoded storage key is not a backend session ID.
  Already-captured keys reject an inconsistent supplied owner.
- Delayed composer writes, cleanup, pagehide, failed-submit restoration,
  first-session assignment and GONE/Undo carry the original captured owner.
  Matching-owner draft enumeration avoids routing encoded keys to the server.
  Legacy raw keys remain recoverable in their old namespace, not automatically
  assigned to whichever profile happens to be active.
- Draft tab titles accept the tile's explicit owner and backend target profile.
  Ambient title subscriptions include owner-readiness changes, not only new
  text writes. Drag titles do not fall back to unowned legacy words when no
  owner can be established.
- Persisted text validation now rejects malformed owned identities before a
  reload can replace known drafts. Failed reads/writes retain corrupt bytes,
  current words and images and expose the existing warning/Retry surface.

These are implementation and bounded test results, not complete ownership
acceptance. In particular, `useComposerDraft` still has an owner-undefined raw
fallback. Pending words must remain safe without silently adopting legacy
content; that branch blocks promotion. Global fresh-draft/restore-notice and
multi-window arbitration also need closure. No fake account identity was added.

## Executed checks and their limits

- Two draft-title regressions failed before correction; three title checks now
  cover explicit same-ID owners, readiness without another edit and a backend
  target-profile alias. A malformed-owner reload regression also failed before
  validation was added.
- Focused owner/store/composer/first-send checks: **53 passed in six files**.
  Renderer typecheck and renderer/main/preload builds exit zero. Native custody
  production code is unchanged from the previous candidate; its tests were not
  rerun in this slice.
- Actual source Electron: **11 checks**, two loopback model requests and zero
  renderer errors. Invalid JSON and a valid JSON envelope with an invalid owner
  key each preserve exact visible text and PNG bytes; Retry leaves the corrupt
  value intact. A valid fixture snapshot clears the warning. Cold restart,
  history without replay and a deliberate exact single send then pass.
- This uses private HOME/VANTA_HOME/userData/projects, synthetic paste/storage
  events and a loopback model. It does not prove OS clipboard, real cross-window
  timing, power-loss, native profile switching or live-account behavior.
- Size ratchet against the unchanged baseline: **ten new/worse findings across
  56 production files**. Remaining seams include the composer hook/store, tile
  lifecycle helpers and candidate collection. No suppression or baseline update.

## Profile triage correction

The earlier direct `window.desktopBridge.api(POST /api/profiles)` returned 404,
but bypassed `vantaApi` and its existing profile shim. It was not the renderer's
Create Profile path. Do not add a duplicate backend route to fix that probe.

The real Create Profile UI was executed using the command palette's keyboard
path and the visible form. It created `owner-b` in a private test home: **three
checks, zero model requests and zero renderer errors**. This establishes profile
creation only, not selection, return-to-draft or restart continuity. The first
pointer attempt was intercepted by the command root; its full call log and
capture remain retained, not relabeled as a pass.

Code inspection separately finds `profile.get/set/remember` returning null
placeholders and `getConnectionFor` sharing the one local descriptor. These are
native routing/persistence gaps, not evidence that profile creation is missing.
Do not use success-shaped placeholders as cross-profile acceptance evidence.

## Preserved packet and exact re-entry

External root: `Vanta-backups/owned-text-custody-20261025-zi5CNC/` (started
October 25; current edits/proofs executed October 26).

- `OWNED-APPLICATION-NOT-READY.patch`: **87 files, 312,755 bytes**, relative to
  `f2c7daacbdbc43f0ca3a4c701131506ff7aa8070`; SHA-256
  `ce47b8fb0196f253570b4fb30e5f41db9bfda83cd5998ce0b55d112d1c7bfe15`.
- Preimage/after-image manifest SHA-256:
  `6d9555702178a93c61ef831b052d20a68636c9ac2cc64768f4f9ad4146b16774`.
- The earlier 88-file packet also contains the separately promoted proof change;
  do not stack it with the 87-file application packet or earlier parent patches.
  Preserved original dirty files and the obsolete diagnostic leak observation
  are excluded from the application packet.
- `owner-final-current.log`, `owner-final-current-types.log`,
  `owner-current-build.log`, `owner-current-size.log`, title/storage failure logs
  and `owner-current-corruption-restart/` retain the bounded checks.
  `profile-real-ui-keyboard/` retains the real form run; `profile-real-ui/` and
  `profile-ui-inventory/` retain failed pointer/direct-bridge probes.

Next: work from a new editable copy; finish unresolved-owner/legacy provenance
without losing pending words, scope fresh/GONE/HUD transitions and close the
size regressions. Establish actual native profile routing before claiming
cross-profile continuity. Then finish unknown-send review and exact packaged/
installed acceptance. Broader chrome remains gated on owner visual approval.
No installed update, main merge, tag/release, CI, spend or live-account action.
