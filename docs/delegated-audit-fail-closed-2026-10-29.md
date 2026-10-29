# Delegated authority audit failure — 2026-10-29

## Result

The shared delegated Ask gate now requires its authority audit append to succeed
before returning an automatic approval. A failed append falls through to the
existing host approval path. Unattended cron denies that path by default; a
separately configured host approver can still explicitly allow or deny it.

This is a bounded SOURCE fix supporting T03-6, not acceptance of that whole
slice. Its exact account/target allowlist, quota, expiry and revocation contract
remains open. The legacy write-scope grant model does not supply the complete
account/quota/expiry contract; this change does not invent or activate one.

## Reproduced defect and smallest change

At base `d045815f0bb50daf295dc3a26541dd1f2d4012cd`, the documented fail-closed
behavior contradicted execution: `tryDelegatedAutoApprove` swallowed audit
append failures and returned the grant ID. The sole production caller in
`agent/dispatch-approval.ts` then treated the Ask as approved.

An actual private scheduled agent run reproduced the escape. Its audit path
was deliberately a directory, so the append failed with EISDIR, yet the
registered `write_file` created the granted file outside the project inside
the private Downloads zone. The new colocated regression test likewise failed
before the repair. Both failures are retained; no owner file was targeted.

The repair changes only the existing append catch to return no delegation.
It does not alter the kernel, grant schema/store, ordinary best-effort event
logging, permission modes, file-zone policy or any protected source.

## Executed proof

All seven journeys use real persisted `cron.tsv` entries, the production
`runDueTasksTracked` and `buildCronRunTask`, the registered file tool and the
unchanged local Rust kernel. The model is a loopback HTTP fixture, not a paid
provider. Private HOME, VANTA_HOME, project and temporary directories are used;
unexpected fetch destinations are refused.

| Scheduled case | Exact target file after run |
| --- | --- |
| Active in-scope grant; successful authority audit | Exact requested bytes; one audit record |
| Same grant; audit append fails | Absent; default noninteractive denial |
| Revoked/inactive grant | Absent |
| Grant for another directory | Absent |
| No grant | Absent |
| Audit append fails; separate configured host approver allows | Exact requested bytes; one host decision |
| Audit append fails; separate configured host approver denies | Absent; one host decision |

Every case also repeats the same scheduler window with the returned dedup map:
zero additional task executions. This proves the exercised in-process window
control, not cross-process scheduling, crash recovery or a recurring quota.
The host decisions are scripted callbacks, not owner-operated approval UI.

Private packet `recurring-audit-20261029-T5uSyb` retains the reproduction,
regression RED, final seven-case summary `summary-1793263974607.json`, exact
fixtures and preservation baseline. Three focused test files pass 84 tests:
`agent/delegated-gate.test.ts`, `agent/permission-gate.test.ts`, and
`cofounder/delegated-authority.test.ts`. Typecheck, all five architecture
boundaries and strict changed-production-file size analysis also pass.

## Delivery and remaining limits

This source fix is not in the installed agent15 app or normal CLI `e467a857`.
No application rebuild, notarization or launcher switch is claimed here.
Installed agent15's existing signature was rechecked successfully; its earlier
versioned UI/provider fixture evidence is retained, not rerun or extended by
this source proof. The app, rollback, normal CLI, pending voice changes,
original dirty work and owner data remain unchanged.

T03-6 and TRUST-03 remain open. No live account, real outreach, unattended
business authority, full R4/R5 acceptance, installed-host behavior, disk-full
hardware failure, full suite, main merge, public release or tag is established.
The next step is the remaining T03-6 authority-model/account/target/quota/expiry
gap, followed by explicit delivery of any accepted runtime changes. O03-3
canonical unknown-effect review clearing remains separate and open.
