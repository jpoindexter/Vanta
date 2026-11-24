# Agent4 — installed local delivery, 2026-10-27

Documentation reconciled 2026-10-28; the delivery identities and dated receipts
below belong to the October 27 build and execution.

## What this does not finish

This delivers scoped file-replacement approval, ACP one-time authority, two
maintained WebSocket callers and one shared native seam. It does not finish the
whole agent, dependency/security backlog, Desktop parity, accessibility, live
accounts, physical hardware or unfamiliar-person acceptance. Existing card Done
contracts and statuses remain unchanged. No main merge, public release/tag,
CI, deployment or paid service occurred.

## Exact delivered identity

| Field | Executed value |
| --- | --- |
| Installed app | `/Applications/Vanta.app` |
| Local version | `0.1.0-local.20261027.agent4` |
| App and normal CLI code | `7d32e58fb57235e49dc9a61a7adff645c6d4c5ab` |
| Declared source | `2de72202e2960409ab1598cee386b83dddf23905f35a3f698dc3a214955cbcde`, 8,285 files |
| Assembly | `534841b02e4accf8202a9cf2a86b378ec7e89e7ebf5c93f3e33df0d98f4cb0fa`, 21,935 files |
| Candidate/installed ASAR | `f915a4b1e42c6068075fd20ef970a9fd4ac3dfd3e39e57f09268e231abb66361` |
| Signed bundled kernel | `813198648b8ec879836909375bf1f96a48601a56b530ce3ef63443b05bf152c2` |
| Apple submission | `450ee2ab-abeb-4495-a5a0-421edb04b82e`, Accepted |
| Final ZIP | `Vanta-0.1.0-local.20261027.agent4-arm64.zip`, 225,630,882 bytes |
| ZIP SHA-256 | `11408ae1441f6392a29c6e387756f99f4265486dde8f4b47a049b63e833d2d27` |
| Previous app rollback | `/Applications/.vanta-install-backups/update-bRemUX/Vanta.app` |

Developer ID signing, ticket stapling/validation and Gatekeeper passed. The
post-staple ZIP was extracted and its complete app fingerprint matched the final
candidate. The installed fingerprint then matched that same archive receipt;
installed deep/strict signature, ticket and Gatekeeper were checked again.
The unsigned kernel input is separately identified in the
[source checkpoint](scoped-replacement-and-runtime-checkpoint-2026-10-27.md);
signing changes its executable hash.

The declared snapshot remains dirty/non-hermetic: existing work was preserved,
not reset, hidden or swept into this commit. Source and full Git identity stayed
frozen through packaging and guarded installation. Later documentation-only
commits do not change the delivered code. A missing Xcode 26 layered-icon tool
left the existing `icon.icns` fallback; pre-existing build/font/chunk warnings
were not silently converted into UI or security acceptance.

## Actual candidate and installed journeys

Each exact app path used its own executable, bundled CLI and bundled kernel,
without a source-runtime override. Homes, projects, profiles, user data and
scripted loopback providers were private fixtures.

Both candidate and installed GUI runs separately passed four criteria: ordinary
streamed Home chat once; exact unsent draft after cold restart with no automatic
send; one deliberate recovered-draft send; zero renderer errors. Each made two
deliberate provider requests.

Both candidate and installed ACP runs separately executed the same six turns in
one session:

1. A routine targeted edit grants ordinary session edits.
2. An existing-file replacement is denied; bytes remain unchanged.
3. The exact replacement is approved once and verified on disk.
4. Another replacement prompts freshly and is denied; approved bytes remain.
5. A standing-instruction edit prompts with its exact identity and is denied.
6. Another routine targeted edit still uses its earlier session grant.

Each run recorded five permission decisions, twelve normal model completions,
six unique operation starts and dispositions
`confirmed / denied / confirmed / denied / denied / confirmed`. Successful
writes have verified readback; no replay occurred. Denial is explicitly known
and returns normal `end_turn`, not an invented uncertain effect/refusal. Both
CLI processes exited naturally with code zero; owned kernels were stopped.
These are scripted human decisions, not owner live-account or normal-profile
acceptance. Earlier unknown-effect/background proofs keep their own source
identities and were not all repeated here.

Actual staged source/native helpers match the verified source bytes and npm
Undici is `7.30.1`. Real WebSocket wire behavior was exercised in the focused
source checks, not through live installed Nostr/Twitch accounts. The neutral
resolver's source hash is unchanged; old Desktop remains present.

## Normal CLI and preservation

Normal `vanta` now selects the independent clean pin at this exact code SHA.
All 10,417 tracked blobs match; there are no Git object alternates. Actual
normal Node 22.23.1 `run.sh` cold/warm/cache, 26 ACP/MCP checks, the six-turn
replacement journey and private global-wrapper routing passed. Post-cutover
wrapper initialization also exited zero. The real compiled config loader reads
the retained high/standard defaults from `vanta-ts/.env`; no unused root `.env`
was created. Existing ambient settings retain precedence.

The old selection, previous pin, unchanged global launcher and original dirty
checkout remain recoverable. All 13 original dirty CLI files, all 239 original
integration work-file hashes and all 57 owner app-data files/backup match. No
credentials or approvals were migrated. No owner process was stopped. The old
five-day kernel rooted at `.vanta/app` remains untouched; only an explicit
unscoped request for that old root can reuse it. New default-pin roots and named
scopes do not silently attach to it. No blanket old-session refresh is claimed.

The old generated candidate/report and superseded agent3 ZIP are recoverably
archived, not deleted. Prior app rollbacks, proof failures, worktrees and original
source files were not treated as junk.

## Evidence, planning and next gate

Parent source checks: 195 focused tests across 13 files, 79 small-kernel tests,
runtime types, strict checks on all 13 changed JS/TS source/test files and the
five architecture boundaries passed. Independent classifier replay passed
29 controls. [Source behavior and audit limits](scoped-replacement-and-runtime-checkpoint-2026-10-27.md)
remain explicit. No broad application suite or exploit stress was run.

Private final receipt: `trust-continuation-20261027-482iSw/delivery-verified.json`.
It binds the full installed fingerprint, archive, native checks, rollback and
preservation. Exact ACP results are in
`acp-fresh-replacement-20261027-ydjH9h/runs/{candidate,installed}-agent4-r1`;
CLI preparation is in `agent-cli-nextpin-20261027-o0Yv0L`.

Canonical roadmap notes and Trello TRUST-03, OP-03, DN-DEP and DN-14 record this
bounded progress without closing unmet contracts. Counts remain 1,365 cards:
1,289 shipped, 64 parked and 12 open (two Building, four Next, five Horizon,
one Blocked). The source push still reported 177 older-default-branch alerts;
dependency security is not green. A private compatible website DOMPurify leaf
candidate was prepared but not applied or built at delivery. The separate
[October 28 website checkpoint](website-sanitizer-checkpoint-2026-10-28.md)
subsequently passes isolated locked installation, production build and real
diagram/reload checks; not deployed or whole-security acceptance. That website-only
follow-on does not alter this installed app/CLI identity.
