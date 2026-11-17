# Vanta Desktop 0.1.4 — 17 November 2026

Published on the normal Apple Silicon macOS Desktop channel and installed on
the owner's authorized Mac through the native updater. This is not an Iris
build, a protected-main merge or a CLI cutover. Global CLI/kernel Latest remains
`v0.9.8`; the normal CLI retains its separately approved `19d68ed5` pin.

[Release and checksums](https://github.com/jpoindexter/Vanta/releases/tag/desktop-v0.1.4) ·
[Download ZIP](https://github.com/jpoindexter/Vanta/releases/download/desktop-v0.1.4/Vanta-0.1.4-arm64.zip) ·
[Changelog](../../CHANGELOG.md#desktop-v014--2026-11-17)

## Included repairs

- Enforce MCP expiry before transport dispatch and retain truthful failure state.
- Preserve Anthropic cache-usage metadata arriving late in a stream.
- Strengthen delegated-worker cancellation and original-turn stream ownership.
- Hold derived delegation replay/follow-up when its checkpoint requires effect
  review. Clean follow-up is a fresh task, not restored child history, budget,
  grants or profile/branch authority.
- Retain Desktop 0.1.3 first-launch, attachment, complete Send/Stop-circle and
  publisher/integrity-checked native-update repairs.

## Final notarized ZIP

| Field | Value |
| --- | --- |
| Source | `d4e72e4408a35deb7243d81093ee7a4c86ae641a` |
| ZIP bytes | `218255594` |
| ZIP SHA-256 | `1f624b1b48aa32e6a557b4629eb591eccf8bafe4b7ba37b057a026dfa737f498` |
| Source SHA-256 | `9c89580c44a8828c0a92bf903fd2d1f43c8b9ace2c891b9b768d3619fdc13787` |
| Notarized app SHA-256 | `b10d34f26897708ffe18a200b714e469b05c9e18e0f85c88999811739013c9af` |
| ASAR SHA-256 | `979027a9b30f880d2ef9112e567b0483a1c006da730ff4396969c06a5e7a4928` |
| App submission | `8488c08d-1701-4afa-abf6-6773b945aa0c` — Accepted |

The stale default Keychain profile returned HTTP 401. An existing key-specific
Vanta profile authenticated successfully; no key was created, revoked or
published. Select a validated saved profile with the existing `--profile`
option of `desktop-next/tools/notarize-app.mjs`; an authentication failure does
not establish that all local keys are missing or unusable.

Apple accepted the app. Publisher verification, stapling, Gatekeeper and final
ZIP extraction/full-payload agreement passed. Node 22.23.1 / Electron 43.8.1,
clean declared source; provenance is not a hermetic-build claim.

## Executed delivery

Public GitHub metadata and anonymous manifest readback match the final archive.
The release has its size/hash/source-bound updater manifest, path-free build
provenance and `SHA256SUMS`. The older unnotarized draft ZIP/DMG are preserved
privately, not advertised as the final release.

Before installation, the all-profile UI showed no Working/Needs input matches.
After a normal quit, the current app and all 60 Desktop data files matched the
fresh private backup. The Vanta-home comparison checked 119,655 regular files
and 159 links with no missing/additional files; one unrelated live readiness
heartbeat changed after copying and one transient socket was not copied. This
is not an atomic snapshot of unrelated services or a credential migration.

The normal installed 0.1.3 app downloaded the release and retained its own
publisher-verified rollback receipt bound to the exact target ZIP/source.
Read-only process/plist observation saw the old app exit, the target become
0.1.4/d4e72e44, and a new app process automatically launch. No GUI observer,
activation or manual reopening was used during replacement. Installed signature,
staple, Gatekeeper, all 19,854-file fingerprint and ASAR match the target above.
Native readback shows existing history and the normal chat surface. CLI launcher
and selection hashes are unchanged. Retaining rollback is not a forced-rollback
execution test.

The exact candidate also passed seven isolated first-launch/restart criteria,
one explicit synthetic reply and zero renderer errors. Its actual bundled CLI
held uncertain replay/follow-up without task append and admitted a clean fresh
task. Packaged network/subprocess instrumentation was unavailable; those
counters are not claimed. Earlier uncached/stale-terminal native proofs remain
their earlier source identity, not fresh 0.1.4 reruns.

## Installer and remaining gates

The separately signed 0.1.4 DMG is withheld. Apple lists submission
`811ced47-897b-4b0b-a960-cf5c8cfcb11b` as In Progress after the submit client's
timeout; no completed upload/acceptance response was returned. Apple's DTS
[explains that an interrupted upload can leave a pending request](https://developer.apple.com/forums/thread/847500).
One controlled attempt using the supported non-accelerated transport is recorded
separately as `330dd364-c4b5-4fbe-8235-58f94e66675f`; both IDs are retained and
pending, not a rejection or completed acceptance. Do not start a third attempt
or advertise the image without an explicit result. No DMG notarization, public
download or fresh DMG install is claimed.
The previous 0.1.3 DMG remains separately available; use this release's ZIP or
native updater for 0.1.4.

Native failure/offline/forced-rollback coverage, stored-tail/attachment-offset
adoption, child continuation/remaining budgets/trustworthy profile-branch
lineage, full parity/accessibility, unfamiliar-person and live-account/voice
acceptance remain separate. No fresh full suite, paid inference or outreach was
performed. Feature-branch release publication does not clear dependency alerts,
independent review or protected-main integration.
