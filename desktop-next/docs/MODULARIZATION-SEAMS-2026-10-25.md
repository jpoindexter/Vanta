# Proven Desktop modularization seams — 2026-10-25

## Gap first

Whole-app modularization is incomplete. Three oversized files remain:
session-actions/index.ts3464lines, store/session-states.ts3180,
store/gateway.ts2624. The last is the new renderer's socket/connection registry,
NOT the runtime messaging gateway. Session actions utils.ts is another2609lines.
Moving a small helper does not resolve these responsibilities or certify parity.

## First bounded extraction

Eight classic-tree native helpers total402lines. Their location does not mean
duplicated or broken behavior: both shells already share them. The smallest
proven seam is serverLaunchArgs15lines. Its implementation moves byte-identical
to vanta-ts/desktop-native/runtime-launch.mjs; both shell launchers import it.
The old module re-exports the exact same function for compatibility.

Preserved: precompiled-bundle preference, explicit tsx fallback, reason text,
companion flag, supplied paths/environment and error handling. No new options
or runtime authority. Classic build.files gains the exact shared file; without
it the old shell's packaged import would break. New shell bundles the helper
into Electron main, so no runtime dependency allowlist widening is needed.

Executed preparation: byte comparison identical;9native helper tests,
17launcher/runtime-root tests,2packaging policy checks, Electron tsc and five
architecture boundaries pass in isolated scratch. Parent's full native-host
command also passes37node tests plus1tray test and2policy checks. Static package
policy is not an archive-content or installed-launch proof; a combined build /
restart acceptance is still needed before calling this delivered.

## Next seams, only after feedback

1. Authoritative transcript reconciliation: extract the two pure wrappers at
   session-actions/index.ts263–295. Preserve anchored persisted-live-turn →
   fallback live projection → durable history order. Keep independent existing
   reconciliation imports used outside those wrappers; do not move them blindly
   into the alreadyoversized utils.ts. Cover anchored and fallback routes, then
   resume/switch journey, row/tool identities and retained richer reply/errors.
2. Session tile codec: extract StoredTile/toStored/parseTileList at
   session-states.ts1257–1326, not storage/migrations/reactive atoms. Preserve
   profile/connection/ownerRoute/workspace identity and legacy-key retirement
   ownership; prove same-profile/two-source restart before further movement.

Leave gateway HMR maps, activation epochs, leases and session ownership together
until separately baselined. No generic state-manager rewrite or arbitrary line
splitting. Supporting slices attach to existing DESKTOP-NEXT-CUTOVER and
DESKTOP-OPERATOR-DOSSIER-HIERARCHY; statuses and Done clauses unchanged.
Classic removal still requires capability-by-capability parity and owner signoff.
