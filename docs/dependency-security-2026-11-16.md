# Default-branch dependency security repair — 16 November 2026

This security-only candidate starts from default `main` at `4911ae44`, not from
the newer Desktop feature stack. It is not a promotion of the unfinished app.

## Scope and executed results

| Graph | Full audit before | Full audit after |
| --- | ---: | ---: |
| Runtime | 35 affected-package entries | 0 |
| Website | 46 affected-package entries | 0 |

Raw dated snapshots: [runtime before](proofs/dependency-security-2026-11-16/runtime-before.json),
[runtime after](proofs/dependency-security-2026-11-16/runtime-after.json),
[website before](proofs/dependency-security-2026-11-16/website-before.json),
[website after](proofs/dependency-security-2026-11-16/website-after.json).

- Update mail/PDF/SDK/schema dependencies and compatible security leaves. Reuse
  the prior reviewed migrations rather than copy newer features into main:
  OpenAI 6.49.0, Zod 4.6.7, Nodemailer 10.2.1, ImapFlow 1.7.8 and PDF.js 6.3.289.
- Preserve explicit string-key records, nested loop defaults, IPv4/IPv6 rejection
  boundaries and recording-clock return validation. Convert Node Buffers to an
  ordinary Uint8Array at the real PDF parser boundary.
- Eight focused runtime files: 51 tests passed, including actual loopback SDK
  requests/SSE/abort/auth rejection, real PDF parsing and SMTP fixture transport.
  Twenty-three schema-consumer files: 250 passed. Session-store/schema follow-up:
  22 passed (some overlap with the earlier slice; not an aggregate unique count).
- Website focused security checks: nine passed. Docusaurus family updates to
  3.10.2 together; existing website content and product roadmap are not rewritten.
- Main CLI `--help` loaded and exited successfully using a fresh isolated home.
  This proves module/startup loading, not a live-model task or whole TUI journey.
- The commit gate found pre-existing session-store size/complexity violations.
  Extract its unchanged schemas and optional save metadata rather than disable
  the gate. Original Session type/export and false-omission/pin-order semantics
  remain. Session-store/search/Desktop-session/schema checks: 36 passed; full
  typecheck and size checks passed after the extraction.

## Verification and limits

- Fresh installation with lifecycle scripts disabled. Runtime installs used
  isolated npm 12.2.2 with `--allow-remote=root` for the already pinned Winnow
  URL; global npm/configuration/authentication were not changed.
- Full installed runtime dependency tree: no reported problems. Version-specific
  Minimatch 9/10 overrides replace inherited parent-context overrides; legacy
  archive/filelist consumers retain their callable 3/5 APIs.
- Archive/executable/link/native-fixture preservation, secret-file exclusions,
  universal-archive matching and exact-target cleanup tests: two passed.
- Website typecheck and full production build passed. Actual built Mermaid
  diagrams and a bundled Mermaid math diagram rendered in clean Chrome with
  no page errors. Mermaid stays 11.16.1 with KaTeX 0.18.2; no unnecessary
  Mermaid-major upgrade. Serializer 7.1.3, Express's scoped qs 6.16.2 and worker
  pool 2.1.2 have focused security/compatibility checks.
- Runtime typecheck and web-renderer build passed. Checks use owned fixtures,
  loopback ports and isolated profiles, not the owner's accounts.
- No audit ignore/allowlist or active advisory dismissal. One obsolete GitHub
  alert (#183) was dismissed as inaccurate only after the primary upstream
  advisory [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
  confirmed withdrawal at 2026-10-22T19:21:04Z.
- No protected Rust/factory source, policy, credentials, approvals, normal
  launcher selection or installed app changed. Generated outputs are preserved
  in scoped local stashes; previous work, archives and downloads remain intact.

No full application suite, live provider/account, microphone/speech, native
computer control, iOS device, Windows/Linux packaging, deployment or
unfamiliar-user acceptance was run. Audit zero is scoped to the dated dependency
graphs, not whole-product security clearance.

## Why the Iris archive is unchanged

The current Iris source's production package paths, versions, integrity hashes
and resolved URLs match the prior delivery exactly. Its rebuilt legacy web
assets compare byte-for-byte with the extracted delivered app. Vite,
electron-builder, app-builder-lib and rimraf are absent from that app's staged
runtime. The separate Desktop graph was re-audited at zero and is unchanged.

Therefore no customer-facing app/runtime update or notarization is needed for
this build-tool/website-only change on the current branch. Keep the existing
signed/notarized [Iris prerelease](https://github.com/jpoindexter/Vanta/releases/tag/desktop-test-20261112.2),
version `0.1.0-test.20261112.2`, Apple silicon only. ZIP SHA-256 remains
`4c5fa6908b14e8aec4c369c123cf8ddefb13a5468adde9403fc16359002c37b3`.
This does not claim a new application build or a new installed-app check.

## GitHub integration gate

At triage there were 213 open GitHub alerts against the old default branch.
After the one upstream-withdrawn dismissal, 212 active alerts remain. Their
reported vulnerable ranges match no package versions in the repaired main
candidate. This reconciliation and local zero audits do **not** close GitHub
alerts: the protected-main PR still needs one independent approving review,
merge, and a GitHub dependency rescan. Admin enforcement and last-push approval
remain enabled. No merge, force push, protection change or paid CI is performed.
