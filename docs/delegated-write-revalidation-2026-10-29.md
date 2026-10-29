# Delegated write revalidation — 2026-10-29

## Result and boundary

File writes now revalidate the exact delegated grant after hooks and awaited
preparation, immediately before the synchronous file commit. This repairs the
reproduced case where a scheduled write/edit consumed a decision after its grant
was revoked. It is source acceptance for part of T03-6, not full recurring
authority, installed delivery or O03-3 unknown-effect resolution.

The decision carries a SHA-256 fingerprint of grant ID, delegator, delegate,
class, canonical bound, active state and grant/revoke timestamps. A host-owned
closure re-reads the same authority store selected at approval time. Removed,
ambiguous, changed, revoked, malformed or unreadable authority fails closed.
Equivalent canonical scopes retain the same authority; changed aliases cannot
silently redirect it. The closure and fingerprint are not model arguments or
new persistent grants.

The shared store parser is reused for asynchronous and final synchronous reads.
`write_file` checks before parent-directory creation and again after that await;
`edit_file` checks after its final awaited preparation. No await separates the
last authority check from the existing synchronous file commit. A denial returns
`ok:false` and `effectDisposition:denied`, never verified. Existing target,
inode/content/parent, overwrite, control-plane and kernel checks remain intact.

## Reproduced and executed

At parent `4c9e64ad`, a private scheduled agent, registered file tool and existing
kernel both wrote the requested bytes after an independent controller revoked
the test grant. A private PreToolUse hook merely rendezvoused inside its project;
the controller modified its own fixture authority store after verifying the
delegated decision audit existed. No owner grant or live account was used.

Eight repaired journeys pass:

| Decision at mutation | Write | Edit |
| --- | --- | --- |
| Unchanged grant | Requested bytes written | Requested bytes written |
| Revoked after decision | No file created | Original bytes retained |
| Same ID, replaced delegate | No file created | Original bytes retained |
| Corrupt authority store | No file created | Original bytes retained |

Each denied journey retains one original decision audit and produces a denied,
not verified, tool receipt. Five reused actual target-boundary journeys also
pass: ordinary write/edit, stable alias escape and post-decision write/edit alias
drift. These thirteen journeys exercise production cron → agent → kernel/file
paths with a private loopback model, private HOME/VANTA_HOME/project and no
external requests. They do not exercise an owner account or installed host.

Ten focused files pass 162 checks, including twenty new revalidation/file-guard
cases. These additionally cover removed and duplicate grants, changed owner,
scope, ID and grant time, duplicate relative-scope aliases, changed grant-directory alias, unavailable callbacks,
read failures and revocation during an inner content confirmation. Typecheck,
all five architecture boundaries, strict size checks for nine production files,
secret scan and diff checks pass. No full application suite was run.

Independent read-only adversarial review found no defensible in-scope defect.
Its pure-gate probe and code tracing are distinct from the parent's actual
scheduled file-mutation evidence.

## Failures and residual limits

The first fixture incorrectly attempted to mutate authority from a sandboxed
hook; its missing checkpoint was not security evidence. The rendezvous then had
to move from protected `.vanta` state to ordinary project files. Only the corrected
controller-backed old failures establish the defect. Initial direct tool tests
used a noncanonical macOS temporary path; canonical fixture roots corrected that
test mismatch. The attempted compiler entrypoint was obsolete; the existing
`npm run typecheck` command passes. Earlier failed packets are retained.
One additional RED case found that filtering unsupported scopes before counting
duplicate IDs could hide an ambiguous relative-scope grant. Duplicate IDs are now
rejected before normalization; that regression remains in the focused checks.

This is not atomic revocation across processes or a filesystem transaction.
Another process can race after the final read; directory preparation may already
have occurred before a later denial. A revoke/restore cycle that restores every
authority-bearing field is not durable revocation lineage. Existing parent-
traversal/hard-link race limits also remain. No blanket immediate-revoke claim.

Fingerprinting a delegate is not initial actor/account binding: the existing
initial gate still lacks that request identity contract. Actor/account, durable
quota/expiry, revocation lineage, persisted alias anchoring and full R3/R4/R5
acceptance remain open. O03-3 also remains open: clearing a legacy ticket is not
evidence-bound canonical unknown-effect resolution across journal, transcript,
run, conversation and queue stores.

Original work, private state and 47 dirty entries are preserved with scoped source
preimages and Git backup. Canonical notes and the existing Trust checklist record
partial evidence only, without status/Done/WIP promotion. Installed agent16 and
normal CLI12c05ed5 are unchanged. No owner grant migration, live effect, protected
source edit, main merge, release/tag, paid service or CI activation occurs.
