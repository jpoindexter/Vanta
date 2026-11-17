# Vanta Desktop v0.1.0 — 17 November 2026

One normal Desktop release replaces the separate Iris test downloads. This is
a bounded maintenance release, not completion of the Desktop redesign, agent
roadmap, original attachment incident, or automatic updater.

[Download the Apple silicon ZIP](https://github.com/jpoindexter/Vanta/releases/download/desktop-v0.1.0/Vanta-0.1.0-arm64.zip)
· [Release and checksum](https://github.com/jpoindexter/Vanta/releases/tag/desktop-v0.1.0)
· [Changelog](../../CHANGELOG.md#desktop-v010--2026-11-17)

## Changes

- Help → Send feedback and Settings → About → Send feedback open one private
  bug/idea form. Review the exact report before sending. Drafts survive restart;
  optional version/platform facts are off by default. No automatic collection of
  chat, attachments, screenshots, raw logs or credentials. Explicit same-ID retry
  preserves report identity; there is no automatic resend of uncertain effects.
- Uncertain-action recovery explains what to inspect before continuing, retains
  the original request for editing, and does not offer automatic replay. A
  settlement failure updates its existing terminal reply rather than adding a
  second failed card. Existing history is not rewritten.
- Native project-local file references now cross the existing filesystem guards
  and carry relative file metadata with the prompt. A file reference and inline
  image can reach the same request. No new filesystem permission is granted.
- Narrow Chat/Home panes reserve the existing composer's shadow gutter. This
  paint correction is not proof that every attachment-triggered layout is fixed.

## Install

1. Download `Vanta-0.1.0-arm64.zip` and `SHA256SUMS.txt` from the release.
   In that download directory run `shasum -a 256 -c SHA256SUMS.txt`.
2. Quit your existing Vanta app and keep a rollback copy. Extract the ZIP and
   move `Vanta.app` into Applications. Do not run two versions on one profile.
3. Open normally. The app is Developer ID signed, Apple notarized and stapled;
   no Gatekeeper bypass is required. This release does not install itself or
   migrate credentials/approvals. Intel, Windows and Linux packages are absent.

## Exact artifact

| Field | Value |
| --- | --- |
| Version / tag | `0.1.0` / `desktop-v0.1.0` |
| Source commit | `b12f8af006e633d0fd6a2b6bf699344632ff2ecd` |
| ZIP bytes | `212780215` |
| ZIP SHA-256 | `622e0fd31b57f5713fc030edecd465fdde757e026b6904e4d4d593c769a0778f` |
| Declared source fingerprint | `79d402400fc5e03d33863a55e3beee22bcdfb21fe56198fb02949087acfea585` |
| Assembly-input fingerprint | `58af547cbb1dd51baaae7a5b9b738498494f49fb69f59b4316817d67c1eaa864` |
| Notarized app fingerprint | `efd7146991df2ecc10af63094272d7fc9e526f6bd3989b6413fc09e0082ca046` |
| Apple submission | `073978c5-e098-4a94-b29f-2f438f2ed5dc` — Accepted |

Node 22.23.1 and Electron 43.8.1 were used. Existing lockfile-matching runtime
dependencies and the unchanged retained kernel were reused. Generated legacy
renderer assets were regenerated during packaging; provenance therefore records
`dirty: true`. App/runtime source was committed at the source above. These
fingerprints describe declared inputs, not a hermetic/reproducible-build claim.

## Executed evidence

- 26 focused feedback tests; 103 Desktop recovery tests and 25 backend recovery
  tests; 51 focused attachment/metadata tests. Applicable typechecks and five
  architecture boundaries passed. No fresh whole-product suite was run.
- Fresh Desktop all-dependency and bundled-runtime production audits each
  reported zero findings. This does not clear the separate default-branch
  GitHub alerts or other repository dependency graphs.
- Developer ID deep/strict verification, Apple Accepted, stapler validation,
  Gatekeeper assessment and final ZIP/app fingerprint agreement passed.
- The final extracted ZIP ran in an isolated profile: its saved uncertain-effect
  card appeared once; Edit request opened the exact original instruction with
  zero model requests; recovery guidance survived an actual quit/relaunch.
- The packaged Files/Images UI admitted one project Markdown reference and PNG.
  Only native picker selection was stubbed. Exact PNG bytes and the file
  reference reached one local mock model request; the reply appeared and the
  file's relative metadata was retained. No paid/live provider was used.
- Native Help and Settings → About both opened the same feedback form. An
  unsent draft survived actual quit/relaunch. Zero renderer errors were captured.
- Exactly one separately owner-approved synthetic report was sent. Private
  database readback confirmed storage and email-service acknowledgment. Inbox
  arrival was not checked. The final extracted-ZIP replay sent no report.

## Distribution and remaining boundaries

The three `desktop-test-20261111.1`, `desktop-test-20261112.1` and
`desktop-test-20261112.2` Iris releases are retained privately as drafts after
replacement-download verification. Their source tags and checksum-verified local
archives remain for rollback; historical documentation is preserved.

CLI/kernel `v0.9.8` remains GitHub's global Latest because existing CLI installers
fetch kernel assets through that endpoint. Desktop `desktop-v0.1.0` is a normal,
non-prerelease release with its own direct download. This does not merge source
into protected `main`, bypass independent review, replace the owner's running
app/CLI, deploy the website, or enable GitHub Actions.

Project-local existing file references are limited to 16 MiB and existing
private-path/symlink/root guards. External files, remote/container byte uploads,
arbitrary document extraction, the original tester machine's attachment/reset
incident, full accessibility/parity and signed auto-updates remain open. See
[attachment investigation](../desktop-chat-image-regression-2026-11-17.md),
[native reference boundary](../desktop-native-file-reference-2026-11-17.md),
[blocked recovery](../desktop-blocked-recovery-2026-11-17.md) and
[feedback](../desktop-feedback-2026-11-17.md).
