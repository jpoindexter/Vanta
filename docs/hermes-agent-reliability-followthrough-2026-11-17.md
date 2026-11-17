# Hermes follow-through: small agent reliability repairs

## Outcome and scope

Make existing agent/MCP behavior truthful and recoverable before adding another shell or feature catalog. Preserve all source work, historical shipped cards, no-replay fences, credentials and the existing two-lane WIP limit. The [canonical roadmap](../roadmap.json) remains authoritative; Trello is a projection.

This follows the [pinned Hermes review](hermes-delivery-priorities-2026-11-17.md) at `27e389359263b7294e2788fee048953fc34b82d1`, not a claim to have reviewed every Hermes commit or installed its runtime. No Hermes application source or assets were copied into Vanta.

## Executed source repairs

Both repairs were independently reviewed and published at [`206efac6`](https://github.com/jpoindexter/Vanta/commit/206efac60c4b9a69eb260627063c055ced0408b6); the remote branch SHA matched exactly. The commit passed the secret, staged-size and five architecture gates. A shared two-use cache-field helper removed the converter complexity violation without bypassing the gate; its five affected Anthropic files then passed 33 cases and runtime typecheck passed again.

### MCP authentication expiry

Owner: `MCP-FLEET-HEALTH-CONTEXT-BUDGET` ([card](https://trello.com/c/R1Z1iJXc)). Broad fleet/context-budget acceptance remains open.

The shared registry used token presence, ignoring its existing millisecond `expiry_date`. An expired token plus an earlier healthy probe incorrectly appeared `ready`. The pre-change regression failed precisely for expired, zero and exact-now expiry.

The shared predicate now requires a known expiry to be strictly in the future. Missing tokens remain unauthorized; unknown expiry preserves the existing compatibility behavior rather than inventing a refresh policy. CLI/Desktop still use the same registry.

Executed checks:

- Registry/auth/CLI/Desktop focused run: 36 passing cases, including missing/future/unknown expiry and explicit-empty tool denial.
- Actual `runMcpCommand(root, ["list"])` invocation in a synthetic isolated profile reports `needs_setup` and `auth needs_auth` despite a healthy prior probe. Network and process-launch guards record zero requests/launches; fixture hashes remain unchanged and the token is absent from output.
- Independent exact consumer files `src/cli/mcp-cmd.test.ts` and `src/desktop/mcp-add-settings.test.ts`: 10 passing cases.

Not established: live OAuth refresh, mounted-server behavior, packaged Desktop UI, or transport-level rejection by direct `connectServer`/`reconnectServer`. The fix reports known expiry; it does not add automatic renewal or prove a working connection.

### Streamed Anthropic cache accounting

Owner: new narrow defect `ANTHROPIC-STREAM-CACHE-USAGE` ([card](https://trello.com/c/45udwYQb)), linked after the existing shipped `HERMES-DELTA-USAGE-ROUTE-LEDGER`. Its source-scoped Done contract is executed and marked shipped; installed delivery remains separate. Do not rewrite the older shipped card's historical acceptance.

The converter discarded `cache_read_input_tokens` in streamed responses, although non-streaming completion, `Usage.cacheTokens` and the route ledger already support it. A production SDK/provider/consumer replay against a local synthetic HTTP/SSE server reproduced correct text with missing cache usage before the change.

The shared converter retains cache reads from `message_start`, preserves them through cumulative output updates, and accepts explicit later cache updates including zero. Missing/null values do not invent a cache hit. Cache creation is not treated as cache reading; no schema, pricing, TTL or billing claim was added.

Executed checks:

- Converter SDK-parser cases: six red failures before the fix; all ten new cases pass afterward.
- Actual SDK → `AnthropicProvider.stream` → `consumeStream` → existing durable route-ledger readback: exact text, 10 input/5 output/1,000 cache tokens, one local HTTP request and one accounted call. Billing remains `unknown`.
- Parent combined provider/MCP/auth/cost run: nine files, 65 passing checks. The consumer tests above were separate; counts overlap the agents' focused runs and must not be added as unique coverage.
- `npm run typecheck` in `vanta-ts`: exit zero.

Not established: a live paid Anthropic request, vendor billing reconciliation, or installed CLI/Desktop delivery. Tests use synthetic input and a loopback server, not an owner's conversation or credentials.

## Executed source follow-ons

### Keep typing while an existing conversation restores

Owners: `UX-04` and DN-22's existing continuity backlog. The composed production keyboard handler claimed a printable key while the conversation's composer was gated off, then lost that key. The initial mounted-editor regression failed with empty text instead of `h`; restoring the text also exposed a caret-at-zero issue in a detached portal mount.

The repair uses the identified destination's existing owner-scoped draft store only during that loading interval. It preserves attachments and restores the captured typing caret only if that same editor already owns focus. There is no window-wide key replay queue, navigation, send, new loader or visual redesign. Unknown owners, hidden/foreign surfaces, stale routes, abandoned restores, IME, shortcuts and programmatic inserts are excluded. Whitespace-only drafts retain their existing empty-draft semantics.

Parent executed five focused renderer files: **68 passing**, including ten new mounted-editor cases. After extracting the narrow caret guard for the enforced complexity limit, the ten cases passed again and the four affected production files showed no new/worse size findings (16 existing). Renderer and Electron typechecks passed. This applies accessibility's keyboard/focus ownership and cognitive-load reduction: preserve intended input rather than require the person to notice and retype it.

Limits: the harness composes production hooks, the floating portal and real rich editor, with assistant-ui runtime/theme mocked. It is not a whole-ChatView or native cold-launch proof. Two existing floating pointer-selection tests fail identically with unchanged HEAD `focus.ts` substituted at transform time; the failure is tracked separately in DN-22, not hidden or attributed to this repair. No whole-suite-green claim.

### Inspect configured fallbacks without testing another route

Owner: `UX-04`'s existing first-use/diagnosis slice. Before the change, `doctor --fallbacks` ran unrelated health/context checks and did not enumerate configured fallback failures. `buildFallbackChain` intentionally still skips unresolved entries during actual fallback execution; its behavior is unchanged.

`vanta doctor --fallbacks` now preserves configured order, duplicates, model settings and user-provider overrides while reporting every entry as `configuration-resolved`, `unavailable` or `not-checked`. It uses the real ordinary/custom resolver but avoids built-in Codex credential access and Claude credential-store access without an explicit environment token. Output excludes raw errors, keys, model names and endpoints. It invokes no model, discovery, kernel, service-health or context probe. Any unavailable/unchecked entry returns 1; an intentionally empty fallback list returns 0.

Parent executed **28 passing** cases across static readiness, unchanged fallback behavior and doctor routing. Isolated handler replays observed zero network requests, process launches, credential-store reads or unrelated checks, with fixture hashes unchanged. This is configuration diagnosis, not authenticated readiness, valid-model proof or live failover acceptance. No live probe or paid request was added.

A separate fresh-process proof ran the real `src/cli.ts doctor --fallbacks` entrypoint from an empty fixture project with an isolated environment and network/process/protected-file guards. It reported ordered local/unknown/subscription entries correctly and returned the intended exit 1; counters were zero network, zero child launches and zero protected credential reads. Initial CLI store setup created only private fixture scaffolding. Yoga's bundled WASM data URI was decoded locally under the guard, not fetched from a remote service. This establishes source dispatch, not the unchanged global CLI pin.

### Interrupted child work: inspection, not automatic continuation

Owner: `DELEGATION-LIVE-STEERING-BUDGET`. A stable child ID now links initial custody, private checkpoint, parent session/project/worker-root evidence and final receipt. Checkpoints are awaited before provider iterations and at pending/started/settled tool boundaries, using existing failure-atomic persistence. Reads/writes stop at 8 MiB, conflicts preserve original bytes, and checkpoint failure stops the worker before further execution. Inspectable workers do not use streamed read-prefetch that could bypass those boundaries.

`vanta agents delegation inspect <id>` is offline local-owner inspection: bounded redacted/control-safe excerpts, last known boundary, declared iteration cap and **remaining budget unknown**. It does not register a normal chat, append a task, call a model/tool, acknowledge custody, restore approvals or continue execution. Queue-wide custody review is labelled queue-wide. The inspector validates the project/root and immutable recorded identity; it is **not** an agent-facing parent/profile/branch authorization mechanism. Historical workers may have no partial checkpoint.

Parent executed seven focused files: **47 passing**. Two actual owned fixture processes were terminated separately after a read-only result and after a text-only retry nudge; a fresh process inspected the exact partial work through the CLI with unchanged custody/review bytes and no additional model/tool ledger entries. Pending and started checkpoint-failure cases prevented tool execution. Identity tampering, symlink ancestors, malformed/oversized records and existing async/receipt/CLI cases passed. This is a real restart proof for inspection, not resumable execution or automatic budget restoration.

Independent review identified an inherited data-loss risk: the delegate's `finally` forcibly removed its worktree/branch even after checkpoint failure or a successful clean but unmerged commit. Both real owned-Git reproductions lost their worker file before the repair. Delegate now retains isolated worktrees on all outcomes, shows the path/branch/cursor, and keeps failures conservatively unknown. No global worktree-manager policy, merge, archive or other caller was changed. New receipt paths also resolve against the actual worker root rather than the parent's different base; historical receipts remain unchanged.

Final focused recovery command covers eight files and **49 passing** cases, including both real retained-worktree cases and the two actual process-interruption cases. The retained edit, raw sidechain, unmerged branch and exact stored receipt path are readable, while parent HEAD/status/existing file stay unchanged. Tests explicitly cleaned only their own fixtures after asserting survival.

Retention limit: no new count/size/age cleanup policy was invented. Retained worktrees consume disk and currently use the existing OS temporary location, which is not an archival backup. Review and preserve useful artifacts before explicit cleanup; do not infer cross-device/file-loss recovery from this proof.

## Dependency-ordered work remaining

1. Review/checkpoint follow-ons and keep installed package delivery separate from source acceptance. Production website documentation build passes; publishing help is a separate deployment.
2. Before child continuation or agent-facing inspection: validate expected parent/profile/branch authority, preserve real remaining budgets, reconcile effects and retain review holds. Never restore grants or replay unknown effects.
3. Run actual packaged cold-launch typing/owner acceptance and diagnose the separately reproduced floating-pointer test gap; do not infer native acceptance from mounted-component tests.
4. Test an exact selected fallback route only with explicit live-probe authority. Never let successful fallback mask a broken entry or claim a static check proves inference.
5. Reproduce adopted-reply/late-tail reconnect behavior before changing production streaming. Existing session identity/no-second-POST protections stay intact.

MCP, child recovery, reconnect, first-use diagnostics and DN-22 now have bounded ordered checklists. Only the new source-scoped cache-accounting defect is closed; no broad card was blanket-closed and no Building/Next lane was added. Owner/live-account/hardware/visual/unfamiliar-person gates remain separate.

## Delivery boundary

The normal installed Desktop remains the previously delivered signed/notarized `0.1.3` at `b2847a8f6665a5294d25478dd3cb20ac140a5da6`; the normal CLI pin is unchanged. This document records source work after that package, not a new app installation, release or update. Protected `main`, repository safeguards and GitHub Actions settings are unchanged.

REA JavaScript analysis was refused by the tool host's approval policy even with filesystem access. No workaround, runtime REA graph or Hopper analysis is claimed. The current work is grounded in inspected source and executed narrow behavior, not an extraction claim.
