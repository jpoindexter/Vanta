# Runtime connection-token logging — source checkpoint

## Verdict

The launcher now supplies its per-launch boundary token to output capture.
That known literal is redacted before reaching runtime.log, error excerpts or
mirrored stderr. Token prefixes remain buffered across process exit until the
corresponding stream ends or the child closes. This is a bounded source
confidentiality correction, not installed-app or full profile-pool acceptance.

## Reproduced and corrected

The existing launcher copied raw stderr to the parent and captured both raw
output streams. A printed local launch URL could therefore expose its boundary
token in logs and failure excerpts. The parent reproduced this on current
canonical source with an actual Node child printing a synthetic, unusable
64-character test token. The before receipt confirms token presence in both
the log and excerpt; no live credential or owner log was used.

The shared capture helper now has one optional options object. The launcher,
its only production caller, supplies the minted token and routes mirrored
stderr through that same capture path. Separate stream buffers handle a token
split across chunks; incomplete final prefixes are replaced rather than emitted.
Ordinary diagnostics and existing bounded-tail/log-error handling remain.

Independent review found that flushing on child `exit` was insufficient: final
stdio data may arrive afterward. That provisional version was not promoted.
The applied version flushes on stream end/child close only, with an explicit
prefix → exit → late suffix → end/close regression for stdout and stderr.

## Parent-executed evidence

- Actual child-process after proof: the synthetic token is absent from the
  persisted log, excerpt and mirrored stderr; all three contain the redaction
  marker. Output is split across real pipe writes. This exercises the actual
  capture helper with real child streams, not a full Vanta process.
- Canonical Electron output/launcher tests: **21 passed in two files**. Includes
  controlled exit/late-byte sequencing, replacement launches sharing a log,
  bounded output, ordinary diagnostics and failure-to-write behavior.
- Electron typecheck passed. Existing size ratchet passed both production
  files with no new/worse findings; no baseline was changed.
- Three source postimages match the reviewed packet; original 239 preserved
  work-file hashes are unchanged. No owner data or installed app was modified.

Evidence directory outside Git:
`/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/combined-desktop-20261027-E6wbNw`.
`token-before/result.json` and `token-after/result.json` contain Boolean results,
not credentials. `before-token-redaction/` retains the three source preimages.

Frozen standalone patch:
`/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/profile-pool-worker-20261027-pdQtEh/TOKEN-LOG-REDACTION-ONLY.patch`.
SHA256: `32720993e2300b0039ba7a93fc0900aeace230825e71f2d3e4d828435838f9b7`.

## Limits and next integration boundary

This redacts the known literal per-launch token, not arbitrary secrets or
encoded/transformed strings. Existing owner logs were not inspected, scrubbed
or deleted. No credential rotation or account action occurred. The installed
recovery2 app still contains its older source and has not received this fix.

The broader profile/custody candidate remains private. Independent review
identified terminal query-path owner bypass, late native Git owner inference
and Default inheriting named model/provider selection. The producer is fixing
these before a new freeze; named-profile chat/approval results do not establish
those cases. Company remains an existing unbound/primary scope, not newly
proven foreground-profile ownership. The prepared loaded-core dependency tree
is copied separately but shared dependencies are unchanged until the producer
releases them. Do not promote a provisional full-pool patch or revert the newer
packaging/source-digest checkpoints.

No full Desktop completion, visual/parity/human/live-account acceptance, main
merge, tag/release, CI, paid service or legacy deletion is claimed.
