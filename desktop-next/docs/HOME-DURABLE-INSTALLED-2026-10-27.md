# Durable Home drafts and attachments — installed checkpoint

## Remaining gates first

This delivers the bounded Home repairs, not the whole Desktop redesign, full
continuity, dependency/security closure or complete modularization. Owner visual
and per-item parity, live accounts, physical dialogs, audible accessibility and
unfamiliar-person acceptance remain open. No normal owner-profile launch occurred.

## Exact delivered identity

| Field | Observed value |
| --- | --- |
| Installed app | `/Applications/Vanta.app` |
| Version | `0.1.0-local.20261027.home1` |
| Code checkpoint | `feea5a4f561d061a3fe3e81c10157ccff94f8a42` |
| ASAR SHA256 | `bce16609f3d793ae2c7d235015e153e4cf41d1b135a9c2b5071be3d48d821a41` |
| Final ZIP | `Vanta-0.1.0-local.20261027.home1-arm64.zip` |
| ZIP bytes | `220457018` |
| ZIP SHA256 | `7e7da4563b74e44474081c822fd3eca6ace9aa1ad189624ca1bb26a72d0a6f18` |
| Apple submission | `ddc96146-0612-4659-b0bf-d59efbe54204`, Accepted |
| Declared source digest | `d91b9575bad394e7d229f1834bfc9d688e9b73cfbc7ada324e21355c2f7bfee2`, 8251 files |
| Assembly digest | `5d1a709f2a757c91379c368327d1192255da50460c46402b1f8bf8abdf60f77d`, 21645 files |
| Retained app rollback | `/Applications/.vanta-install-backups/update-FQqe1j/Vanta.app` |

Provenance declares a dirty source/assembly snapshot, not a hermetic HEAD-only
build. Source remained frozen from packaging through installed proof. The signed
candidate and installed ASAR match; signature verification, ticket stapling and
validation, and macOS assessment passed. The final ZIP was rebuilt after stapling,
extracted and fingerprint-checked. A private temporary directory was needed for
this Mac's framework-symlink extraction behavior; no validation was skipped.

The installer replaced only the idle app and retained the preceding archive2
bundle and receipt. A fresh private app-data backup contains 57 entries, all
unchanged after installation and private proofs. All 239 originally preserved
work-file hashes still match. Earlier 82-file app-data inventories are historical,
not substituted for this fresh snapshot. The terminal `vanta` command, owner
credentials, profiles and schedules were not changed.

## Executed packaged and installed behavior

Each of the following ran once against the candidate and once against the actual
installed executable. Both used their own bundled runtime and kernel, private
homes/user-data/projects and a loopback scripted model, without source-runtime
or kernel overrides. Main executable/resource identity was asserted; the text
journey also captured and asserted the actual bundled child-process paths.

| Journey | Checks per path | Observed behavior |
| --- | --- | --- |
| Home text, handoff and restart | 13 | Quit before actual Attach/Send confirmation recovers exact words and Bravo selection; pending Send is disabled; repeated Enter cannot duplicate handoff; recovered Attach changes runtime project before the existing picker; cancel, cold restart and renderer reload retain text; two deliberate sends contain plain words, not source metadata; accepted Home Send clears its source |
| Selected/image-only attachment continuity | 11 | Real native/kernel project roots agree; explicit selected-image send retains exact PNG bytes; cancel does not borrow an older image; unsent text and image-only drafts survive quit/relaunch and reload; explicit image-only send retains exact PNG bytes; both original project briefs remain unchanged |

Total: **24 checks per path**, five deliberate model requests per path, zero
renderer errors across all recorded lifetimes. Recovery never sends automatically.
These are two bounded journeys, not the previous archive2 six-journey suite
repeated on this version. Final OS dialog answers are controlled fixtures; the
application handlers, persistence, runtime, kernel and model transport are real.
No physical-dialog, real-provider, owner-account or performance acceptance follows.

[Source evidence](HOME-DURABLE-SOURCE-2026-10-27.md) records the 122 focused
tests, types/build, architecture/design checks, capacity preservation, source
revision guards and ambiguous-send behavior. Native failure injection for every
accepted-send/cleanup error and concurrent-window storage was not performed.

## Security and maintenance boundaries

Later investigation: [transport tooling and built-in runtime evidence](UNDICI-TOOLING-SECURITY-2026-10-27.md)
records a process-terminating malformed-response failure in this exact installed
runtime's built-in fetch primitive and an uppercase integrity mismatch bypass.
No full-agent exploit or owner-profile test is claimed. Later npm-only fixes do
not repair that embedded implementation; the runtime remedy remains open.

The delivered code also includes the separately evidenced Desktop Vite,
runtime test-tooling, legacy Vite and Fast URI checkpoints. Runtime all-dependency
audit at that snapshot reports four high findings, production-only zero. The
separate Desktop production-lock audit reports 12 findings: four moderate,
eight low, no high/critical. Website and older default-branch alerts remain open;
neither zero runtime findings nor notarization means security is green.

REA static inspection of this candidate's own Electron framework confirms
embedded-ASAR integrity and ASAR-only loading are disabled; Node options,
Node inspection arguments and RunAsNode remain enabled. These are unresolved
packaging-hardening boundaries, not proof of a running inspector or an exploit.
RunAsNode currently serves the bundled CLI architecture; disabling it blindly
would break that path. No fuse or signed artifact was modified during inspection.

Private evidence, signatures, notary/install logs, source/data rollback, final
ZIP and reports remain in `home-delivery-20261027-lOkIXt`; journey results and
screenshots are in `home-durable-parent-20261027-FhHVB8`. Static REA evidence ID:
`ev_a02a9dc052842020f6efe5d7deee9f8452cb672c63b2583df94faabce917e745`.

No full suite, main merge, public release/tag, CI, paid service, legacy removal
or roadmap status promotion occurred. A later evidence-only documentation
commit does not change the installed code checkpoint above.
