# Live approval recovery — 2026-10-28 source checkpoint

Subsequent local delivery: [agent10](agent10-installed-2026-10-28.md) executes
this repair in both the exact notarized candidate and installed app. The source
checkpoint below retains its original evidence boundary.

The previously failing full-renderer-reload journey now passes with the current
source renderer, freshly compiled backend and known release kernel. This is not
yet a new installed build or whole-card/product acceptance.

## Behavior and authority

A reload erased the renderer's client registry. Opening the saved conversation
allocated another backend client, losing the original pending approval and
incorrectly presenting Done while the original action still waited.

An explicit live-resume open now discovers the original backend client without
replacing its running conversation. The binding checks the saved chat, original
runtime map entry, request, canonical project, profile and private home. Ambiguous,
changed, missing or aborted identities fail closed. History-only opens do not
adopt live work. Ordinary active conversations cannot be overwritten by open.

A request-local cursor spans disk/provider awaits, so a turn finishing during
open returns its current terminal result rather than stale saved history. Newly
started or substituted work invalidates the cursor. Observational GETs report
the retained result; missing results are never treated as successful completion.

The renderer reuses its existing rich failure/receipt mapper, including an initial
terminal envelope, without duplicating the saved assistant message. Same-chat
opens are coalesced; completed request identity and local turn/completion checks
reject stale responses. Connection generations fence close/reconnect races.
Recovered observation stops on disconnect and resumes on reconnect without
stopping a later ordinary turn's approval poll. Failed probes are removed.

Recovery sends no new chat or action request, automatically approves nothing,
copies no credentials/grants and does not revive consumed authority. This repairs
renderer reload while its original backend lives. It does not recover a killed
backend's in-memory pending action, restart an unknown effect, or clear all
draft/attachment/queue/reading-position continuity gates.

## Executed evidence

- 90 focused renderer checks across eight relevant files pass, including 16
  live-recovery cases. Review regressions were observed failing before repair:
  lost terminal failures, duplicate completion, close/poll leaks, stale opens
  and newer-turn history overwrite. Original RED receipts are retained.
- 25 backend helper, finite HTTP-boundary and actual open-handler cases pass.
  Deferred load/setup barriers exercise completion and ownership changes during
  opening. These fixture tests do not prove the entire server router.
- A separate real-server-router/two-gateway integration passes: close the first
  stream, recover the exact original pending approval through a fresh gateway,
  approve once, observe one edit and exactly one original chat submission.
  This uses the production server with a scripted provider and stand-in safety.
- Nine touched renderer files have zero scoped TypeScript 6.0.3 diagnostics and
  zero strict size findings. Ten backend files also have zero scoped type/size
  findings. This is not a full application typecheck or full-suite claim.
- Renderer, Electron-main and compiled-runtime builds pass. The real Electron
  replay stages the current compiled backend as private real files and selects
  the known release kernel, not the unrelated canonical debug binary or CLI70.
- Real source-Electron round 1: actual B approval card waits; switch to A, type
  an unsent draft, retain route/words/logical caret/focus, return to B's real row,
  click Allow once, observe exactly one append and the retained A draft.
- Round 2 adds a full page reload and actual event-stream resubscription. The
  same approval ID returns; its target remains absent until the real Allow once
  click; the append occurs exactly once. A's earlier draft survives the reload,
  and its newly appended words, caret and focus remain intact. There is no direct
  approval POST substituting for the UI click.
- Exact source/runtime/renderer fingerprints remain unchanged during replay;
  zero renderer errors are observed, including shutdown. All identified private
  Electron/backend/kernel processes close. Original 239 integration files and
  13 modified legacy CLI files remain byte-identical.

Independent reviews found and informed the regression repairs. Final bounded
static review found no remaining high-confidence blocker; review is not runtime
acceptance. A first Electron rehearsal recovered the card but failed because the
driver incorrectly expected an empty A draft in round 2. The corrected assertion
requires retention of the first draft plus new text; the failed receipt remains.
An initial size failure was resolved by extracting the cohesive stale-chat guard,
not by suppression or changing its limit.

## Delivery and remaining gates

Installed agent9 and normal CLI70 are unchanged at this source checkpoint. No
main merge, release/tag, paid service, CI, policy/Rust/factory edit, owner visual
approval, human/live-account acceptance or legacy retirement is performed.
Roadmap/Trello notes record bounded progress only; IDs, statuses, dependencies,
Done criteria and history remain intact. Fresh packaged/installed replay is the
next delivery gate; full design/parity, dependency security, native control,
voice and remaining modularization are still open.

Private evidence: `live-client-recovery-20261028-6B8EuN` and sealed backend
`live-session-backend-v2-20261028-7nyOZz`; the original backend proposal and failed
reload diagnosis remain separately retained. These private paths are not public
download artifacts or proof that an unfamiliar person accepted the app.
