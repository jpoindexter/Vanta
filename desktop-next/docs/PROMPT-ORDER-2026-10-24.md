# Prompt order — 2026-10-24

## Done criterion and cause

For the observed rapid four-message settle-edge path, model requests, visible
user turns, navigation previews and durable history must all remain 1, 2, 3, 4,
with no duplicate request. Source execution only; not installed-app acceptance.

The rail was not sorting incorrectly. At baseline 291aa701, an actual private
Electron replay delivered 1, 2, 4, 3 to the model and persisted that same order.
A refused busy-turn redirect queues its text, but the idle composer could send
a newer draft directly before that queue drained. The remote enqueue fallback
could also bypass the older window-local queue.

## Small change

- Ordinary sends join an already waiting queue, even across the busy-to-idle edge.
- Existing local entries keep new payloads on that same queue instead of sending
  them through the server queue ahead of the local entries.
- External composer requests respect waiting entries too. Draft/attachment
  ownership, freeze/restore behavior and queue drain claims remain unchanged.
- Manual slash commands stay immediate. No sorting, new UI, permissions,
  retry, backend or persistence-format change.

## Executed evidence

- New regressions failed before the fix: idle/busy sends bypassed the queue;
  remote enqueue skipped the local fallback. Focused tests: 88 passed / 3 files.
- Exact-index source candidate: prompt-order-candidate-20261024-leTnv8 under
  the external Vanta-backups directory. Build: 339 runtime chunks.
- Actual Electron replay: 9 checks, four model requests, matching model,
  transcript, rail and durable-session order, zero renderer errors. Retained
  report/screenshot: `proofs/prompt-order-2026-10-24/`.
- The first post-fix proof sampled optimistic UI before request four reached the
  model. It was corrected to wait for the fourth actual reply and streaming
  settlement, not weakened to accept fewer requests. A command launched from
  the wrong cwd is not counted as candidate evidence.
- Size ratchet: 21 inherited violations, none new/worse in the two production
  files. All five architecture boundaries, brand (zero), design (no increase),
  staged secret scan and diff checks pass. Renderer typecheck retains its
  inherited missing session-resume fixture failure; not a clean typecheck claim.

## Preservation and remaining boundary

Pre-edit backup: Vanta-backups/prompt-order-20261024-52nL18 (verified full-history
branch bundle, binary dirty patch, untracked archive). All 273 existing changed
or untracked regular files must retain their original bytes; wider design stays
uncommitted. No normal profile, paid model, live account, Rust/factory, install,
main merge, PR edit, tag, release or CI enabling.

This does not prove arbitrary simultaneous multi-window submissions or an
unresolved redirect RPC followed by another send. DN-13/22/29 remain open.
Cmd+L/tooltip ownership is the next separate cause, not certified here.
