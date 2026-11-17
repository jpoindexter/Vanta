# Gateway and event ownership — source checkpoint

## Boundary

Follow-on to `5b53e092`. Bounded criterion: the connection's verified owner
accompanies the actual renderer gateway's HTTP requests and native event
subscriptions, conflicting ownership cannot retarget that gateway, and
unsupported stream owners refuse without delivering a frame. Ordinary chat
and exhausted queued-work retention must still execute through the app.
This is a prerequisite for real profile runtimes, not their implementation.

## Cause and correction

`VantaBridgeGateway` ignored the descriptor URL. `bridgeTransport` sent unowned
requests and subscriptions, and stream IPC had no owner field. The prior
request-owner guard therefore did not cover a gateway's live event source.

Native connection URLs now carry the verified profile. Each gateway binds its
own owner before connecting; later reconnects may use that same owner, not
retarget live work. Malformed/foreign connection URLs and conflicting request
owners refuse. The optional typed event owner survives renderer/preload/main
validation and reaches ServerHost. The host validates the same captured
transport's actual owner before opening its event stream; cancellation still
prevents delayed subscriptions. Malformed native stream ownership is rejected,
not dropped to a primary fallback. Existing stream/window limits remain.

The app-wide company client's existing unbound transport retains primary
behavior. This change does not make ambient native terminal/Git/company actions
profile-aware. The runtime-pool implementation must bind native client owners,
including ambiguous reused IDs, rather than silently dispatching to primary.

## Executed evidence

Private evidence: `Vanta-backups/profile-runtime-20261026-oucTfk/`.

- Canonical renderer/real-server chain: **seven passed/three files**. Includes
  same client ID under two different profile-scoped gateways, immutable route
  rejection and malformed native stream-owner refusal. Canonical Electron:
  **45 passed/three files**, including wrong-profile/device stream refusal.
- Renderer and Electron typechecks and renderer/main/preload builds pass.
  All nine changed production paths pass strict size limits. No baseline edits.
  The initial test adapter had parameter/mock typing errors; corrected its
  declared contract, without relaxing production types. Initial route parser
  complexity was 11; equivalent pathname membership reduces the branch count
  without removing validation. Failed diagnostics are retained.
- `tools/proof/native-gateway-owner.mjs`: actual canonical source Electron,
  **four checks**, one intentional loopback model request, zero renderer errors.
  The descriptor URL names the verified owner. Actual chat stream IPC carries
  that owner and the exact completed assistant reply is saved. Wrong-profile
  and foreign-device subscriptions close with their specific error and no frame.
- `tools/proof/queue-exhaustion-retention.mjs`: actual canonical source,
  **three checks/two launches**, zero model requests/errors. Both exact queued
  requests and the exhausted retry budget survive without replay or discard.
- The wider candidate separately passes the same four-check native owner
  journey and its **six-check** attachment/queue/edit/cancel/save/restart
  journey. That does not establish cross-profile or installed continuity.
- The 3.09 MB candidate application snapshot secret scan has zero findings;
  this is not a fresh full-history/dependency security audit.

## Preserved wider candidate

Frozen packet `OWNER-STREAM-APPLICATION-NOT-READY.patch`: **111 files**,
456498 bytes, base `5b53e092`.
SHA-256: `e00fafc81bb7f3f91a49c40b61b99e9bd01daf8f115a86943978571a5471b3e9`.
Manifest SHA-256:
`cece289f78f8dc4c164801a61291ab6b16776f72d11927e55c56910efe453e8e`.
Dry-run application passed before the scoped source promotion. The candidate,
all original239 dirty files and installed recovery2 ASAR remain unchanged.
Do not edit this frozen copy or apply old packets wholesale to newer source.

## Next full-goal work

Reuse ServerHost in a lazy per-durable-profile runtime owner, preserving
background work; honor explicit profile selection independently of sticky
next-start preference; bind home/provider/policy and owned kernel endpoint;
route requests, events and native approvals to the same owner; prove actual
switching and restart. Then complete legacy/HUD/concurrent/unknown-send custody,
integrate the wider candidate, package/sign/notarize/install with rollback and
execute the exact build. Owner visual/parity/human/live-account gates remain.
No card closure, main merge, tag/release, CI/paid change, protected-source edit
or legacy capability removal is authorized by this checkpoint.
