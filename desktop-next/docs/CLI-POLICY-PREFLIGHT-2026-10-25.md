# CLI policy-before-startup checkpoint — 2026-10-25

## Scope and delivery status

Source checkpoint `510e0450` follows `25a91493` and is now separately packaged,
signed/notarized and installed. See
[POLICY-PREFLIGHT-DELIVERY-2026-10-25.md](POLICY-PREFLIGHT-DELIVERY-2026-10-25.md)
for exact identity and candidate/installed receipts. Ordinary terminal CLI
delivery remains separate from replacing Desktop. This closes a bounded startup
ordering defect, not the full local-state recovery card or all CLI operations.

## Cause and change

`runCli` previously started kernel/provider prewarming before authoritative
settings validation. `prepareRun` also consumed or bootstrapped the kernel
before capability setup loaded settings. A background-only check was not
sufficient: unconfigured chat could choose setup instead of showing policy
recovery.

The existing session dispatch now awaits a validation-only shared preflight
before prewarm, provider configuration, setup and session lifecycle dispatch.
Direct kernel bootstrap, independent provider preconnect and consumption of a
previously warm client also validate before their effects/return. Validation
does not apply settings environment values or cache policy. Diagnostic/config
repair dispatch is not blanket-blocked. Safe mode retains its deliberate
settings bypass; bare mode still validates settings.

Four production files changed; two existing tests now use isolated homes and
one colocated regression file was added. No dependency, permission, approval,
Rust, factory, MANIFESTO, owner state or auto-restart policy changes.

## Executed source evidence

- Parent runtime typecheck: exit 0.
- Parent focused session/kernel/prewarm/capability suite: 18 passed in four
  files; no full application suite.
- Parent size gate: four production files within limits. All five architecture
  boundaries hold; no suppression or baseline update.
- Parent ran actual source-built CLI dispatch, not private exports or `--help`:
  `run` 18/18, configured `chat --no-tui` 5/5, unconfigured chat 4/4.
- All 20 normal/bare invalid-policy cases returned the exact recovery path,
  retained original settings bytes, did not apply the policy environment marker
  and attempted zero fetch/socket/TLS/subprocess effects. Seven safe-mode
  controls intentionally reached kernel attempts, all blocked by the driver;
  these are not zero-attempt cases.
- The seven integrated source/test files match the frozen isolated candidate
  byte-for-byte. Original 273 preserved work files are checked separately.

Private retained parent receipts: `cli-run/receipt.json`,
`cli-chat/receipt.json`, `cli-chat-unconfigured/receipt.json` under
`Vanta-backups/prewarm-custody-20261025-CBOp8C`. The scoped patch, reviewed guard,
controller and worker causal/red-green report are retained beside them.

The proof denies all network and Vanta child processes before importing the
actual bundled entry. It permits only decoding the exact local Yoga WASM data
URI (decoded SHA-256
`7ba9c9483c8c38a468e9aef4a95ed72fad8a43594be8e5123eb3bdb6479edf5b`),
without calling real fetch. A private preseeded `.git` directory suppresses
unrelated first-home initialization. Synthetic provider configuration selects
the actual setup path without replacing provider/setup functions or invoking
a live model. The first blanket-fetch harness stopped at Yoga before dispatch
and is not policy-ordering evidence.

## Not established / exact next action

Initial environment/store loading and profile/vault activation retain their
earlier sequence. No claim is made about all process initialization, arbitrary
operational commands, filesystem atomicity/CAS, symlink/concurrent snapshot
races, real TTY/setup interaction, owner profile, or live-account behavior.

The same guarded public paths now have separate exact candidate and installed
receipts in the delivery record above. Next: finish the isolated attachment
custody/recovery contract and execute cold-restart image-draft acceptance.
No image-restart fix is included in this checkpoint.
