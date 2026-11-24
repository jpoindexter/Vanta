# Chat admission ownership — 2026-10-28 source checkpoint

Delivery update: [agent11](agent11-installed-2026-10-28.md) now includes this repair
and passes 23 actual compiled-router checks on both candidate and installed copies.
Normal CLI70 remains older; the original source-checkpoint limits below are retained.

The slice's criterion is one admitted execution per client state across body,
authentication and queue awaits; rejected overlaps must not claim a queued item,
stop the owner's stream or emit completion. Independent clients remain usable,
Stop reaches the owner, and stale cleanup changes none of its successor's fields.

## Cause and smallest shared repair

`handleChat` checked busy before awaiting the body/authentication, but only marked
the state active later. Two requests could pass that first check. Cleanup also
cleared shared fields before comparing controller identity.

A module-private WeakSet now reserves admission synchronously before body reads.
The existing body/auth/queue/execution path runs inside a finally-released guard.
Only cleanup with the matching AbortController may change execution fields.
No persisted state, API, approval policy, kernel code or queue migration is added.

All three callers were inspected. Companion/public wrappers separately toggled
streaming even on rejected requests, and public emitted successful completion
after a busy 409. Their duplicate flag management is removed; the shared lifecycle
owns streaming. Public success events require a successful HTTP response. Existing
transport-failure events and typed/SSE terminal payloads remain unchanged.

## Executed evidence

- Three admission/cleanup regressions failed before the shared repair; two more
  caller-wrapper regressions failed before correcting those existing callers.
  The original outputs are retained, not described as passing checks.
- The focused set passed 68 tests in ten files: body/queue admission, invalid
  input and read failure, independent clients, stale cleanup/Stop, existing chat,
  queue restart/effect review, live-session recovery/open races, and both remote
  server integration paths. The final test-only typing correction was rechecked.
- Twenty checks execute the actual production HTTP router on a private loopback
  server with a deliberately unfinished first body. Normal/queue overlaps are
  refused before any provider admission or claim. Authenticated public and
  local companion overlaps retain active streaming and emit no false completion.
  Independent B completes while A waits; Stop settles exactly A as interrupted.
  Its durable follow-up remains queued, and its saved transcript contains only
  the intended request and stopped reply. The server closes naturally.
- Six-file scoped TypeScript 6.0.3 checks report zero diagnostics. Five files have
  zero size findings; the public routes file retains the exact pre-existing
  readiness-probe complexity-11 finding. No new/worsened finding or baseline
  change occurs; this is not a full typecheck or complete modularization.
- Original 239 integration files, 13 dirty legacy CLI files, 32 owner-data files,
  installed agent10 ASAR and normal CLI70 selection remain unchanged.

Private evidence: `Vanta-backups/chat-admission-20261028-A26kry` contains the
preimages, both original red outputs, focused checks, type/size/preservation
receipts and the actual HTTP driver/result. Its private token is issued and
revoked only in its own disposable home; no owner credential is read or copied.

## Limits and next delivery

The HTTP journey uses a deterministic conversation/provider, not a real model,
tool effect, Rust policy, Electron window, installed build or owner account.
Admission is per in-process client-state object, not a cross-process or global
project lock. Rejected work is not auto-enqueued or retried; normal queue controls
retain their existing contract. Full client reload/approval recovery must be
rechecked on the new delivery. Installed agent10 and normal CLI70 do not yet
contain this source checkpoint or the preceding MCP request-correlation repair.

Canonical notes are appended without changing card IDs, statuses, Done contracts,
dependencies or shipped history. Full security, parity, accessibility, owner/
human/live-account acceptance and modularization remain open. No main merge,
release/tag, CI/spend, protected source edit or legacy retirement occurs.
