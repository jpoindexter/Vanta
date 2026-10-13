# gitExecFile has a command allow-list; a failed git call must not look like "no change"

Date: 2026-10-13 · Area: worker runtimes, changed-file diff

`git/process.ts` only runs commands in a fixed set (`status`, `diff`, `ls-files`, `rev-parse`, ...);
`hash-object` is not in it and throws "unknown commands require separate execution authority". My
snapshot helper swallowed the error and recorded every file as "unhashed", so before and after compared
equal and a changed file looked untouched. One test (modified, new, deleted) still passed because
before-snapshots had no entry for the new file.

How to apply: hash file contents in Node (sha256 of the bytes) instead of shelling out, and when a helper
degrades on error make the degraded value unmistakable and test the "was already dirty, then edited
again" case, which is the one that exposes it.
