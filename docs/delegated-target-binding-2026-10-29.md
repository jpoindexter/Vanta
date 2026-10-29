# Delegated file-target binding — 2026-10-29

## Result and scope

The existing delegated write-scope gate now compares the same canonical target
the file tools use, anchored to the active project. The approved resolved path
also travels through the dispatcher to the existing file-target capture helper;
`write_file` and `edit_file` reject a redirected target before touching it.
Model arguments and effect descriptor/journal identities are not rewritten.

This is partial SOURCE work on T03-6, not completion of recurring business
authority. Exact actor/account, quota, expiry, later revocation and the full
R4/R5 contract remain open. The installed app and normal CLI are unchanged.

## Reproduced defects

At base `5fdea35931b138083d1b6bdc2764580ead844903`, real private scheduled
agent runs wrote outside the grant through four forms of the same mismatch:

- A path inside the granted directory followed a symlink to another directory.
- A relative path was checked against the grant rather than the active project.
- A legacy relative grant was reinterpreted without a durable project anchor.
- A `~` path outside the grant was treated as relative text inside the grant.

Normalizing the initial comparison alone was insufficient. Two more actual
journeys used a private approved PreToolUse fixture to change a symlink after
the grant decision: both write and edit followed the redirected path. Carrying
the decision's resolved target to file-target capture closes those tested paths.
Capture failures happen before mutation and are now typed denied, not unknown.
The existing descriptor/inode/content/parent checks remain intact.

The initial drift harness put an HTTP hook in the wrong scope, so it did not
perform the swap; that failure is retained and is not security evidence. The
corrected fixture uses a private project exec-form hook, explicitly opts that
test profile into project hooks, verifies the authority audit already exists,
then changes only its owned temporary symlink. No production hook or network
safeguard was relaxed.

## Executed journeys

Twelve actual persisted cron → production cron-agent → registered file-tool →
unchanged Rust-kernel journeys pass, using a private loopback model and private
HOME/VANTA_HOME/project/temp directories. No owner grant or live account is used.

| Case | Observed result |
| --- | --- |
| Ordinary absolute write inside grant | Exact requested bytes; one authority audit |
| Stable symlink escapes grant | No target file; no delegated audit |
| Symlink remains inside grant | Exact requested bytes; one audit |
| Granted directory itself is an alias | Exact requested bytes; one audit |
| Relative request resolves outside grant in active project | No target file; no audit |
| Relative request resolves inside absolute grant | Exact requested bytes; one audit |
| Legacy relative grant | Separate host approval required; unattended write denied |
| `~` path inside grant | Exact requested bytes; one audit |
| `~` path outside grant | No target file; no audit |
| Symlink redirected after delegated approval, before write | No redirected file; denied; prior decision audit retained |
| Unchanged delegated edit | Exact edited bytes; one audit |
| Symlink redirected after delegated approval, before edit | Original redirected file bytes retained; denied; prior audit retained |

The earlier seven audit-failure/scope/revocation/manual-decision scheduler
journeys also pass again against this repaired source: 19 scheduled journeys
in total. Four separate actual source CLI processes prove relative grant
rejection without persistence, absolute grant creation, revocation and list
readback. These are not the installed normal launcher.

Eight focused files pass 155 tests, including retained RED regression cases.
Typecheck, all five architecture boundaries, strict size analysis across all
nine changed production files, secret scan and diff checks pass. No full suite
or new package/notarization was run for this checkpoint.

Private packet `delegated-target-20261029-ndYPrT` retains the baseline, initial
four escaping cases, two corrected post-approval drift reproductions, final
12-case summary `summary-1793265048137.json`, audit regression log, actual CLI
summary, source hashes and backups. Earlier evidence remains unchanged.

## Compatibility, delivery and remaining limits

New CLI `--write-scope` grants require an absolute path. Existing relative
grants are preserved on disk but no longer eligible for automatic file-write
approval; the normal host decision path remains available. No grant is silently
rewritten, migrated or recreated. Absolute scopes, legitimate in-scope aliases,
relative requests inside an absolute scope, and ordinary nondelegated file
operations retain their tested behavior. Kernel blocks and fresh consequential
confirmations are not relaxed.

Installed agent15, its rollback, normal CLI `e467a857`, original dirty work,
owner data and pending voice files remain unchanged. This source fix still
needs versioned delivery before claiming installed acceptance. It does not
prove live accounts, real outreach, owner-operated approvals, full recurring
authority, concurrent filesystem transactions or full TRUST-03 completion.
Node's documented parent-traversal/hard-link race limits remain; this is not a
claim of filesystem CAS. A persisted grant whose directory alias later changes,
grant revocation during an in-flight decision, actor/account binding and
durable quota/expiry consumption still require their own executed criteria.

T03-6 stays incomplete. No new WIP, protected-source change, main merge,
release/tag, paid service, CI activation or unattended business outreach.
