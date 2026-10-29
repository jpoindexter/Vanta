# Approved normal CLI cutover — 2026-10-29

## Current delivery

After fresh owner approval, the unchanged normal `vanta` launcher now selects
independent committed runtime `12c05ed5ee759d999edfaf3f59353a5dac025d3c`, replacing
the earlier `e467a857` selection. The old runtime and exact selection backup are
retained. No credentials, profiles, approvals or grants were copied or migrated.

This delivers the accepted audit-failure fallback, resolved delegated-file target
binding and LinkedIn author binding through the normal command. It does not
include the later [journal modularization source checkpoint](effect-journal-modularization-2026-10-29.md).
The installed signed/notarized agent16 app remains unchanged at the same runtime
source12c05ed5 plus its declared preserved overlays. No new app install was needed.

## Executed cutover proof

Before changing the selection:

- All 10,505 tracked candidate source blobs still match the approved commit,
  with zero mismatches and no Git object alternates. Dependency lock and unchanged
  kernel identities match the verified candidate.
- The complete candidate dependency fingerprint (34,522 files) and compiled
  generation fingerprint (2,214 files) match the sealed readiness record. All
  saved readiness-result hashes match; no candidate change invalidated approval.
- Current normal selection, unchanged launcher, original work/data and installed
  ASAR match the baseline. The exact approval was durably recorded as consumed
  before replacing the selection; the replacement was atomic and backed up.

After changing it, the actual unchanged global launcher reads a private profile's
selection seeded from the freshly read normal selection. No production
`VANTA_REPO` override is used. It answers ACP initialization from the exact
`12c05ed5` compiled generation, exits zero with empty stderr, and retains the
native runtime helper. Normal selection and launcher identity are checked again,
as are source/work/data preservation. This is an actual launcher execution, not
just a pointer/file check; it is not an owner-account or paid-provider session.

The [readiness checkpoint](cli-target-delivery-readiness-2026-10-29.md) already
ran a real TTY greeting/streamed answer/clean exit, 19 compiled scheduled target/
audit cases, 11 Gmail boundary cases and 12 LinkedIn cases using private local
fixtures. Those unchanged candidate results were hash-verified, not misleadingly
reported as a new rerun. No real email or LinkedIn post was submitted.

## Preservation and remaining gates

The original 239 integration files, 13 legacy CLI files, 32 owner-data baseline
files and 47 dirty status entries remain unchanged. The previous CLI runtime,
selection backup, installed app and app rollback remain recoverable. Pending
voice work is preserved and excluded. No broad cleanup was performed.

Canonical roadmap notes and Trello descriptions record this delivery without
closing either Building parent or changing original checklist/Done/dependency
contracts. Scoped documentation and a verified Git delta bundle are retained.
This is an integration-branch checkpoint, not a main merge or public release/tag.

T03-6 exact actor/account/quota/expiry/in-flight-revocation authority and O03-3
canonical uncertain-effect resolution remain incomplete. Source journal
modularization still needs separate delivery. Dependency security, broader
modularization, owner visual/parity, human acceptance and real business usefulness
remain open. No full suite, new installed-app interaction replay, live-account,
microphone/native-control or whole-product security acceptance was performed.
