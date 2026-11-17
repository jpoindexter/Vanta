# Native project-file references — 17 November 2026

Release-preparation check for `DESKTOP-CHAT-IMAGE-FAILURE-RECOVERY`.
This is a bounded supporting repair, not closure of the owner's original incident.

## Reproduced boundary

The signed `0.1.0` package built at `07bbd7a1` admitted a synthetic Markdown
file and PNG into its composer, then reported `Could not attach brief.md` on
submission. The native compatibility dispatch had no `file.attach` implementation;
the renderer expected a successful attachment response from that missing method.
Mocked staging responses in older renderer tests concealed this missing adapter.

## Narrow repair

- Implement the native local-file method using the existing Electron guarded
  file reader, not a new upload endpoint or wider filesystem grant.
- Require fresh backend project identity to match native root evidence before
  and after the guarded read. Missing, private, outside-project, symlink escape,
  changed-root, malformed and oversized inputs remain refused.
- Link project-local regular files up to 16 MiB. A binary PDF may be referenced;
  this does not claim its content has already been extracted or read by a model.
- Return a native `@path` reference with explicit `uploaded: false`. Deliver
  the matching relative `files` metadata alongside, not instead of, inline image
  bytes. Keep the legacy gateway's existing staging contract unchanged.
- Byte uploads and external-project attachments remain unsupported on this
  route. Do not add grants, copy files, inline document contents, silently omit
  a failed attachment, or automatically retry an uncertain submission.

## Executed source proof

The real gateway dispatch first returned unsupported method `-32601`, then 19
focused cases passed using the actual native filesystem guards. Native file
metadata assertions first failed, then passed. The combined attachment/image/
submit selection passed 51 cases with 125 unrelated cases skipped.

## Executed package proof

The [normal Desktop v0.1.0 release](releases/desktop-v0.1.0.md) includes committed
source `b12f8af0`. The earlier package without this repair was held, not
published. The replacement is signed, Apple Accepted, stapled and Gatekeeper
accepted; final ZIP/app fingerprints agree.

The final extracted ZIP exercised the Files/Images UI in an isolated profile.
Only native picker results were supplied by the fixture. A project Markdown
reference and exact PNG bytes reached the same single local model request;
the reply appeared, relative file metadata persisted, and zero renderer errors
were captured. This is not real-provider document interpretation or arbitrary
external ingestion. Exact owner-session causation, remote uploads, larger or
corrupt files and whole-product acceptance remain unverified.
