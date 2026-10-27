# File approvals retain their target — source checkpoint

## Gap first

This closes the reproduced JavaScript-await target-swap gap in `write_file`
and `edit_file`, not every filesystem race or the complete instruction boundary.
The installed profile1 app does not yet contain this source change. No owner
files, credentials, policies, Rust, factory or live provider were changed.

## Cause and bounded correction

Both original real tools could accept approval naming one AGENTS.md, then
write an unapproved CLAUDE.md after the approved path became a symlink during
the approval wait. The original approved file remained untouched while the
tools falsely reported a verified write. A private filesystem reproduction
executed both failures against source51d5dabf.

Both tools now capture canonical path, parent identity, inode/link/version
metadata and source bytes before content approval. They revalidate after awaits
and use a non-following descriptor for final write/readback; new files use
exclusive creation. A changed target refuses rather than reusing approval.
Existing readable-file, approved alias, nested-creation, diff, diagnostic and
checkpoint behavior remains. Explicit edit denial now reports `denied` instead
of falling through to an `unknown` receipt; its new assertion failed first.

## Executed parent evidence

- Both real tools reject the same symlink swaps in the canonical checkout;
  original and unrelated bytes remain unchanged and no verified receipt appears.
- The real scripted agent loop executes both tools with swapped/denied targets,
  including dispatch, inner approval, transcript and action/turn receipts.
  All four cases preserve bytes and produce no verified accomplishment.
  Only the safety verdict/provider are fixtures, not live kernel/provider proof.
- Focused file/instruction/path/diagnostic/checkpoint tests pass; the separate
  whole tools suite passes after correcting its pre-existing compound-Git test.
  That test now uses supported direct `git -C` and separately proves compound
  `cd ... && git ...` remains refused. No production Git guard was relaxed.
- Runtime typecheck, startup compile, strict changed-production-file size and
  diff checks pass. No whole application suite is claimed.

Exact logs, original repro, source preimages and hashes are external:
`Vanta-backups/scoped-integration-20261027-4TCvWX/`, with the original frozen
packet `approval-target-candidate-20261027-IQmrWY`. The parent additionally
changed only edit denial reporting and its assertion after that packet froze.

## Remaining limits

Final I/O is synchronous and blocks proportionally to file size. Existing
write-only/unreadable files now fail closed because source binding requires
read access. This is not an atomic transaction, crash-durability guarantee or
cross-process lock. Parent traversal, content and hard-link changes by another
process can still race the final checks; partial I/O can leave partial content.
Checkpoint restore and unrelated writers are unchanged. Keep the canonical
instruction-write card open; no native, packaged or owner acceptance is implied.
