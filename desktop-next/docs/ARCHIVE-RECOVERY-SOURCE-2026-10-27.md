# Archived chat recovery and session-action extraction

## Gap first

Source Electron behavior is executed; the installed profile1 app has not yet
been replaced. This is not final visual/parity acceptance, whole session-action
modularization or permission to remove the old renderer.

## User-visible correction

Archiving the last chat hid the header containing Filters, leaving no sidebar
route to Archived. The parent native baseline reproduced that dead end after
two successful steps. The empty state now exposes an ordinary keyboard-operable
Archived action using the existing translated label, ghost button and filter
store. Existing New project and non-empty filtering remain available.

## Modularization

Archive/restore logic moves from the existing session-actions index into a
141-line service and35-line callback hook. The index shrinks3432→3328 lines;
its recorded findings fall24→22, not zero. Public callbacks and dependencies,
profile fail-closed routing, lineage pins, optimistic hide/tombstones, rollback,
post-success unread/tile cleanup and reads of mutable refs are retained.
No other session-action or state/gateway concern is declared modularized.

## Executed parent proof

- Actual source Electron: create a chat, archive its visible row, keyboard-open
  Archived from the otherwise empty sidebar, restore the same chat, reopen it,
  quit and relaunch. Five assertions pass, exact identity/transcript survives,
  one total model request, no automatic resend and zero renderer errors.
- Archive/restore suites:10 tests; sidebar/filter suites:21 tests. Owner-routing
  subset:10 passed,138 unrelated tests deliberately not run.
- Renderer typecheck and production/main/preload builds pass. New production
  modules and changed empty-state component pass strict size checks; the old
  index passes its ratchet with22 existing findings, not a clean-size claim.

Exact pre/postimages, native screenshots/result, failure baseline and logs:
`Vanta-backups/scoped-integration-20261027-4TCvWX/` and the frozen
`session-archive-extract-20261027-8UquJT` packet. The UI correction is separate
from that behavior-preserving extraction. Original239 work files remain intact.

Not checked: owner data, all concurrent archive failures, broader session
actions, full assistive acceptance, installed path or visual sign-off.
