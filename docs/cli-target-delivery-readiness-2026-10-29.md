# CLI target/audit repair — verified staging, 2026-10-29

Historical staging record: a later fresh approval and executed
[normal CLI cutover](cli-approved-cutover-2026-10-29.md) now select this exact
candidate. The unselected/pending wording below records its earlier state.

## Delivery state

The independent CLI candidate is pinned to committed source
`12c05ed5ee759d999edfaf3f59353a5dac025d3c`, the same runtime source delivered
in installed Desktop `0.1.0-local.20261029.agent16`. All 10,505 tracked source
blobs match that commit; no dirty Desktop overlays, pending voice files,
credentials, profiles or approvals were copied into the CLI candidate.
Dependencies were cloned from the retained prior runtime under the identical
lockfile. The unchanged kernel has SHA-256
`0a8511a6d09ef67a05e2eb303234792d5fcb6b0cb5a1209fe3b02a2721017a78`.

**Staged, not selected:** the normal `vanta` command still selects the previously
approved `e467a857` runtime. Its launcher, selection and old runtime remain
unchanged. Fresh exact owner approval is required before selecting this new
candidate; the previous cutover approval is not reusable. No account or
authority migration is part of the proposed switch.

## Executed evidence

| Actual path | Observed result | Boundary |
| --- | --- | --- |
| Existing global launcher, private remembered candidate, `run.sh` and startup compilation | ACP initialize answered from `generation-HJuxOB/src/cli.js`; clean exit, empty stderr; native helper present | Private profile, not normal launcher-selection cutover |
| Existing global launcher, explicit candidate, real TTY and unchanged kernel | Composer visible; submitted greeting reached model; streamed response visible; `/quit` exited zero | Local scripted model, not owner-profile or broad keyboard acceptance |
| Candidate compiled scheduler → cron agent → registered file tools → unchanged kernel | Twelve resolved-target cases pass: allowed absolute/relative/tilde/alias controls; escaped/ambiguous scope refusal; write/edit post-decision redirection refusal | Snapshot target binding, not filesystem CAS or complete recurring authority |
| Same compiled scheduler/agent path | Seven audit cases pass: healthy, failed persistence, revoked, outside scope, absent grant, separately configured host allow/deny; repeat same window adds no run | Local fixture grants only; no new owner grant |
| Candidate compiled Gmail registry/effect gateway, actual auth refresh/store and loopback HTTP | Eleven cases pass; five intended synthetic submissions; four distinct-process confirmed/unknown replays make no extra request or approval | Transport redirected to local fixture; no real Gmail send/draft |
| Candidate compiled agent/registry/LinkedIn tool and unchanged kernel | Twelve cases pass: both audiences, denial, token/author drift, revocation, expiry, cancellation, late credential drift, reset, missing ID and rejection | Synthetic provider only; successful posts remain provider-confirmed/readback-unverified |
| Installed agent16 reinspection | Code signature and Gatekeeper pass; version remains agent16 | Reinspection, not another installed interaction replay |

The candidate uses the new audit-failure fallback and resolved write-target
binding rather than a source-only test seam. No production code or safety
policy changed during this delivery check. The earlier source acceptance and
[exact agent16 candidate/installed interaction evidence](agent16-desktop-delivery-2026-10-29.md)
remain separate, versioned records; they were not needlessly rerun or expanded.

## Preservation, publication and rollback

The private checkpoint packet retains the original launcher selection, baseline
hashes, candidate source identity, proof drivers and results. Before publication,
the 239 original integration files, 13 legacy CLI files, 32 owner-data baseline
files and 47 original dirty status entries are checked unchanged. The installed
app and exact previous app rollback are retained; no installation or cleanup
was repeated. A scoped Git delta bundle accompanies this documentation checkpoint.

Canonical roadmap notes and the two existing Building Trello parents record
readiness only. Original Done criteria, IDs, statuses, dependencies, checklist
completion and WIP remain unchanged. This is an integration-branch checkpoint,
not a main merge, public release, tag or completed product.

## Still open

- Selecting the verified CLI requires fresh owner approval followed by actual
  post-switch launcher verification. Until then, the normal CLI lacks these
  latest repairs.
- T03-6 actor/account binding, durable quota/expiry, in-flight revocation,
  alias changes between runs and full R4/R5 acceptance remain incomplete.
- O03-3 canonical uncertain-effect review clearing remains incomplete; legacy
  ticket resolution does not establish it.
- Live-account/business usefulness, owner visual/parity approval, human testing,
  native control, microphone/voice and broad accessibility remain unexecuted
  here. Pending voice work is preserved and excluded.
- Dependency security and modularization remain open. No full suite, paid CI,
  protected-source edit, live provider action or public release was performed.
