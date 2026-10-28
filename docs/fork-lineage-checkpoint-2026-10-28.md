# Durable chat branching — 2026-10-28 source checkpoint

New Desktop branches now retain their immediate parent after backend refresh,
later saves and cold restart. This is rebuilt-source evidence, not yet a new
installed delivery. Installed agent8 and normal CLI `2d739e68` are unchanged.

## Cause and bounded repair

Fork helpers copied the transcript but omitted parent metadata from the durable
session schema, metadata, export and two independent Desktop projections. The
optimistic sidebar relationship consequently disappeared on refresh. The older
store and live CLI forks also used second-resolution IDs that could overwrite a
parent or sibling created in the same second.

An optional `parentSessionId` now crosses the existing save/list/detail/export
seams. Both fork helpers and live CLI forks use UUID-suffixed, create-only IDs;
later saves preserve an existing parent rather than rebinding it. Live CLI forks
copy the current conversation, including unsaved messages, and change session
identity only after persistence succeeds. Origin project, folder and model
metadata remain attached. A never-saved CLI parent remains a truthful orphan;
the fix does not fabricate a parent record or project identity.

The two Desktop projections translate genuine metadata to their existing tree
fields. No new UI framework, schema migration, old-data rewrite or authority
transfer is introduced. Parent identifiers are provenance, not permission to
read a different profile or project. Legacy records remain readable without
invented ancestry. Checkpoint-copy origin is not guessed.

## Executed evidence

- Before the repair, seven runtime/API lineage checks failed and one existing
  fork-ID control passed. Both Desktop projection checks failed; the legacy
  no-guessed-parent control passed. Setup-only command-path failures are retained
  separately and are not counted as reproduced product bugs.
- Final narrow runtime/API run: **48 checks across seven files passed**. Includes
  forced UUID collisions, unchanged source/sibling bytes, live unsaved history,
  failed-save identity retention, grandchild immediate-parent identity, later
  checkpoint/title/pin/archive/trash saves and JSON secret-content exclusions.
- Desktop projections and existing branch-tree tests: **26 checks passed**.
  Both runtime and renderer typechecks, fresh source build and all five
  architecture boundaries pass. All eight changed production files have zero
  size-rule findings before and after; no baseline or guard is waived.
- Actual rebuilt-source Electron: New chat Alpha/Beta → real sidebar Branch →
  child continuation → grandchild Branch → switch → quit/cold restart. All
  **four exact histories and immediate-parent edges** survive. Backend list and
  detail, the actual row projection and the visible branch stem agree. Both
  app lifetimes close with **zero observed renderer errors**, including after
  awaited shutdown. No direct session write or DOM mutation creates the chats.
- The UI replay binds to the freshly rebuilt canonical runtime, generated
  renderer/runtime fingerprints and live app/CLI/kernel executable mappings.
  Its verified release kernel is explicitly prestarted on a private port: this
  does not establish or change the source launcher's debug-kernel selection.
  Existing row props are implementation-only observations; independent RPC/REST
  projection tests remain separate from the rendered-path proof.

Private evidence packets: `fork-lineage-20261028-mr7aHo` and
`fork-lineage-electron-20261028-gsCuPz`. The latter retains before/after screenshots
and exact histories; the former retains source preimages, red/green logs, actual
exit receipts and preservation checks. Only private loopback model fixtures are
used; this is not a live-provider or owner-account run.

## Preservation and remaining delivery

Original integration and legacy CLI work, owner-data baseline, installed agent8
and the normal CLI selection remain unchanged. Recovery packets and app rollbacks
are retained. No protected Rust/factory/MANIFESTO changes, credentials/approval
migration, main merge, release/tag, CI, paid service or legacy retirement.

Next: a separate exact package/sign/notarize/install replay must deliver this
backend and renderer repair together. Whole-flow drafts, attachments, queues,
reading position, visual/accessibility/parity sign-off, live native/account
actions, human acceptance, remaining trust/security and full modularization are
not cleared by this checkpoint. No whole-card status is promoted.
