# Exact package provenance and final archive — source checkpoint

## Verdict

The authoritative source now records the actual declared-source and assembly
input fingerprints in each new package, including a truthful dirty flag. The
notarization entry refuses old/mismatched provenance before keychain/Apple
access and regenerates the delivery ZIP only after successful stapling and
assessment. This is a verified tooling slice, not a newly delivered Desktop.

## Implemented boundary

- Require the package source's own Git root and full commit. Copied snapshots
  cannot inherit a parent repository's identity.
- Hash declared source bytes/modes, including ignored source files a compiler
  can import. Refuse source symlinks and secret-shaped inputs; do not read
  owner profiles, credentials or dotenv build inputs into the receipt.
- Check source stability around build/assembly and exact assembly-input
  stability before signing. Embed provenance in Resources and app.asar while
  retaining the existing short commit/version identity.
- After successful notarization, stapling and assessment, create a temporary
  ZIP, extract it, check its signature/ticket and compare archived/current app
  fingerprints. Publish the final checksum/report only after those checks;
  preserve the previous archive/report on the exercised failure paths.

Provenance explicitly says `hermetic: false`: declared inputs are not a claim
of a fully reproducible toolchain or independently verified runtime behavior.

## Parent-executed evidence

From the authoritative checkout on 2026-10-27:

```sh
node --test desktop-next/tools/packaging/install-app.test.mjs desktop-next/tools/packaging/package-provenance.test.mjs desktop-next/tools/packaging/delivery-archive.test.mjs
```

Result: **32 passed, zero failed**, approximately 1.8 seconds. The actual
notarization CLI ran against tiny fixture apps with mocked Apple commands and
real ZIP creation/extraction. Tests cover final post-staple archive bytes,
rejection/staple/signature/provenance failure preservation, input changes,
secret-shaped input refusal and exact provenance embedding.

The parent also executed the real canonical notarization entry against its
old release artifact with a sentinel profile. It exited 1 for missing
`Contents/Resources/vanta-build-provenance.json` at the preflight, before the
keychain-profile check. The old artifact was not submitted, signed or installed.
Missing provenance currently surfaces a filesystem error rather than a friendly
one-line migration message; the fail-closed behavior is intentional.

Five production MJS files were explicitly analyzed with the existing size
analyzer: zero findings. All seven integrated file hashes match the frozen
review packet. Actual current-checkout source capture succeeded with 8,140
declared files, dirty=true, base commit `367f69ad`, source digest
`0ea9a2f15eac69af9c94dd71983fb6d4b19ef5eaf0094bcc78ca0bfc86061220`.
That digest identifies this capture, not an installed build.

## Preservation

Packet outside Git:
`/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/package-provenance-20261027-VhAR4q`.

Frozen seven-file patch SHA256:
`8f85cc90600f1924dcf456fe7eda42f3d2aa4973601cad88ab39f7a8f15c33fd`.
Existing source preimages were copied to `parent-before/` before application;
new paths were checked absent. No original dirty work was absorbed into this
slice. The installed app, rollback apps, owner data and shared dependencies
were not changed. No Apple credentials were requested or inspected.

## Required next work — not closed

The installer currently compares expected Git commit/version but does not
recompute this dirty-source digest. Same-HEAD edits after packaging therefore
still require a rebuild; a private follow-up is binding the actual install
entry to current-source provenance. This checkpoint does not close that gap.

Still required: combined profile/custody/dependency integration; actual fresh
package, signing, Apple notarization, final archived-app validation, recoverable
installation and exact installed chat/restart proof. Background streams and
native approval effects, design review, parity and human/live-account gates
remain separate. Disk headroom temporarily fell to approximately 5 GiB during
review, then recovered to approximately 15 GiB without any deletion by these
workers. No new full build/copy was started during the low-capacity interval;
recheck capacity before combined packaging. No roadmap status/Done
change, main merge, release, tag, CI, paid service or legacy deletion.
