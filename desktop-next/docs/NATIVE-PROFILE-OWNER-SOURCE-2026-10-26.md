# Native profile ownership — source checkpoint

## Boundary and Done criterion

Source-only follow-on to `496714e6`. The bounded criterion is: the native
descriptor reports the runtime's actual profile; explicit requests for another
profile/device refuse before reaching that target; ordinary default-profile
chat still saves its reply, and metadata reads do not change saved bytes.
This is not live profile switching, a new process pool, remembered startup
selection, full draft custody, or installed Desktop acceptance.

## Reproduced cause and correction

An actual source Electron launch created `owner-b` through Profiles, but both
native descriptors pointed at the same backend without a profile. Unknown
devices were accepted, and profile get/set/remember returned null placeholders.
The preload proxy dropped ownership fields and main validation stripped them.
The roster also used editable display names instead of durable profile IDs.

The correction reads `/api/profiles/current`, independent of the next-start
sticky default. The native descriptor and profile calls validate that owner;
unavailable explicit owners refuse instead of masquerading as the active one.
Explicit REST ownership survives preload and main validation. ServerHost
verifies and dispatches through the same captured transport/token, so a restart
between those steps cannot silently route the action to a replacement runtime.
Roster/default lookup uses durable IDs. Existing single-local-registry profile
code is extracted into its cohesive module; no second state store is added.

`profile.set` and `profile.remember` now validate the already-running owner;
they do not implement switching or new persistence. Implementing that behavior
requires actual profile-owned lifecycle, request/event routing, window/client
binding and restart evidence. That requirement remains open.

## Executed evidence

Private evidence root:
`Vanta-backups/profile-continuity-20261026-hj2HmX/` outside this repository.

- Canonical Electron focused checks: **47 passed/four files**, including owner
  validation, direct request mediation, restart transport binding and existing
  bridge/startup contracts. Runtime profiles HTTP checks: **nine passed**.
- Renderer, Electron and runtime typechecks and source builds passed. All nine
  changed production paths pass the strict size limits, with no baseline change.
- `tools/proof/native-profile-owner.mjs`: actual canonical source Electron,
  **four checks passed**, zero model requests and zero renderer errors. The
  real Create Profile UI creates the fixture; descriptor, set/remember, REST
  and direct chat-effect calls refuse another owner. The effect's specific
  error is asserted, not just a generic 409. Original unsent words survive and
  the active profile remains unchanged.
- `tools/proof/session-metadata-read.mjs`: actual canonical source Electron,
  **three checks passed**, one intentional loopback model request and zero
  renderer errors. Ordinary chat saves the exact assistant reply and terminal
  receipt; exact metadata is returned without transcript/system prompt. Missing
  and unsupported-profile reads refuse distinctly. Reads preserve saved bytes.
- An earlier chat proof failed because its helper awaited streamed text rather
  than terminal persistence: the later assistant save legitimately changed the
  file during the byte comparison. The revised proof awaits the actual saved
  terminal receipt before sampling, then retains the exact equality assertion.
  No runtime save behavior was weakened. The failed result is retained beside
  `canonical-chat-terminal/result.json` and `canonical-owner-exact-refusal/result.json`.

## Wider candidate reconciliation — not delivered

The isolated candidate now includes the latest source queue-exhaustion
preservation, healthy-list readiness and non-discarding cleanup while retaining
captured-owner custody guards. Four stale/overlapping paths were reconciled;
one deletion helper was removed rather than retaining a second discard path.
Focused reconciliation **56/four files** and related REST **56/four files**
pass; these counts overlap and must not be summed.

The candidate's actual Electron corruption/recovery/restart journey passes
**11 checks**, queue/edit/cancel/save/restart **six**, and empty-history
retention **four**. Those fixtures are not cross-profile/live-account proof.
The combined size ratchet finds no new/worse violations across 70 production
paths, with 94 inherited findings. The 3.09 MB application patch scan found no
secrets; this is not a fresh full-history/security audit.

Frozen candidate: **109 files**, base `496714e6`, 468302 patch bytes.
`RUNTIME-OWNER-APPLICATION-NOT-READY.patch` SHA-256:
`0e555793fc1b13a07f2be4a24bd68eef256c8cf83f6c6f85e6506ad74fe7e089`.
Manifest SHA-256:
`fb8c5cbd62ebff5d9d0128a4fbfc70f6f55fbdc56001389274d7a9d552203bff`.
The packet is frozen; continue in a new copy, not by editing it or stacking
old packets wholesale. Only the dependency-ready owner guard enters source.

## Remaining full-goal work

Actual named-profile runtime switching, scoped event streams and remembered
startup; legacy recovery, HUD/concurrent windows and unknown-send continuity;
integration of the wider custody candidate; exact package/sign/notarize/install
and rollback acceptance; owner visual/parity and deferred human gates. The
installed recovery2 app is unchanged. Dependency/security and broader trust
work are not closed by this patch. No roadmap status, Done criterion or
dependency changes; no main merge, tag/release, paid/CI change, protected-source
edit or capability removal.
