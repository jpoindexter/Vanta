# Hermes follow-through: small agent reliability repairs

## Outcome and scope

Make existing agent/MCP behavior truthful and recoverable before adding another shell or feature catalog. Preserve all source work, historical shipped cards, no-replay fences, credentials and the existing two-lane WIP limit. The [canonical roadmap](../roadmap.json) remains authoritative; Trello is a projection.

This follows the [pinned Hermes review](hermes-delivery-priorities-2026-11-17.md) at `27e389359263b7294e2788fee048953fc34b82d1`, not a claim to have reviewed every Hermes commit or installed its runtime. No Hermes application source or assets were copied into Vanta.

## Current status — 24 November 2026

Desktop **0.1.4 / d4e72e44** is publicly released and installed. A fresh read of
the installed app's version and GitHub release metadata confirms 0.1.4 and a
non-draft, non-prerelease release targeting that commit. This readback does not
repeat native acceptance; the exact earlier executed installation, notarization
and package proofs remain in the [delivery checkpoint](agent-delivery-cleanup-2026-11-17.md).
Normal CLI remains the separately approved **19d68ed5** pin, not the bundled
Desktop CLI or latest integration source. Historical receipts below retain
their original build identity; their then-current 0.1.3/401/draft limits are
not the present delivery state.

The newer [private reporting and native Open logs repair](desktop-support-reporting-2026-11-24.md)
is published source at `3043277a`, not part of installed/public 0.1.4. It does
not establish the external tester's PDF incident cause or successful pathless
PDF ingestion.

Current remaining agent boundary: interrupted-child inspection and derived-task
admission are executed; queued-worker continuation is not. Do not add a resume
path until the supported host supplies trustworthy parent/profile/branch
identity and real remaining-budget accounting. Fresh-task admission must not
be relabelled as restored execution. No inherited approval or unknown effect
may be replayed. MCP/cache source proofs below do not establish live OAuth
renewal or paid-provider billing reconciliation.

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

**Subsequent live-boundary follow-through:** the earlier registry-only limit above was tested rather than inferred away. Against a synthetic loopback MCP endpoint, direct connect/reconnect and startup mounting still transmitted the known-expired stored bearer; mounting even registered a live tool. Five new regression cases failed, including expiry while an approval was pending. The raw RED evidence is preserved.

Registry and launch paths now share the existing expiry rule. The launch-only loader refuses known-expired OAuth before starting an effect, and checks again immediately before creating the transport after approval. Direct connect/reconnect report local-expiry `needs_auth`, not a fabricated server HTTP 401 or a missing-command error. Startup mounting uses the existing auth-pending flow when auth configuration exists and registers no tools. It never substitutes another static credential for known-expired stored OAuth, refreshes automatically, mutates the token, or clears an unknown-effect receipt.

Executed: all **11** new live-boundary cases and the eight-file **91-case** compatibility/safety run pass. A separate actual edited-TypeScript-source loopback run reports zero requests for expired direct/reconnect/mount, unchanged token bytes, zero preflight effect assessments/approvals, and successful future/unknown-expiry/missing-token controls. Post-approval expiry retains unknown-effect custody and a repeat does not execute the operation again. Stdio and static-token behavior remain covered. Counts overlap; they are not unique additional coverage. This proves synthetic source behavior, not owner connectors, real OAuth renewal, real kernel interaction, or installed delivery.

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

Published at [`a26f07b4`](https://github.com/jpoindexter/Vanta/commit/a26f07b418f3419430e1c43e151413041625230e), with an exact remote SHA match and clean checkout. Parent reran the final 49-case recovery proof, 28-case fallback proof, runtime/renderer/Electron typechecks and the post-extraction ten-case typing proof. The production website build, secret scan, staged-size baseline (no new/worse findings) and five architecture boundaries passed. A private 33-file recovery archive was read back and compared byte-for-byte before committing. No protected-main merge or installed runtime change occurred.

### Keep typing while an existing conversation restores

Owners: `UX-04` and DN-22's existing continuity backlog. The composed production keyboard handler claimed a printable key while the conversation's composer was gated off, then lost that key. The initial mounted-editor regression failed with empty text instead of `h`; restoring the text also exposed a caret-at-zero issue in a detached portal mount.

The repair uses the identified destination's existing owner-scoped draft store only during that loading interval. It preserves attachments and restores the captured typing caret only if that same editor already owns focus. There is no window-wide key replay queue, navigation, send, new loader or visual redesign. Unknown owners, hidden/foreign surfaces, stale routes, abandoned restores, IME, shortcuts and programmatic inserts are excluded. Whitespace-only drafts retain their existing empty-draft semantics.

Parent executed five focused renderer files: **68 passing**, including ten new mounted-editor cases. After extracting the narrow caret guard for the enforced complexity limit, the ten cases passed again and the four affected production files showed no new/worse size findings (16 existing). Renderer and Electron typechecks passed. This applies accessibility's keyboard/focus ownership and cognitive-load reduction: preserve intended input rather than require the person to notice and retype it.

Limits: the harness composes production hooks, the floating portal and real rich editor, with assistant-ui runtime/theme mocked. It is not a whole-ChatView or native cold-launch proof. Two existing floating pointer-selection tests initially failed identically with unchanged HEAD `focus.ts` substituted at transform time. The DN-22 follow-up below supersedes that unresolved-test finding; no whole-suite-green claim.

#### DN-22 follow-up: distinguish editor restoration from deliberate control focus

The two floating-selection failures came from the fixture: it simulated a stale editor restoration by focusing an independent button, and its fake editor lacked the production rich-input slot. Production intentionally lets independent controls keep focus and select their pane, including approval controls. Changing that behavior would hide the test error and regress keyboard ownership.

Only the fixture changed: identify the editor with the existing rich-input slot, send stale editor focus to that editor, and separately assert real `button.focus()` selects its own pane. No production focus behavior changed. Parent reran the two exact composer/typing files: **16 passing**, plus renderer and Electron typechecks. The wider affected renderer group passed **81 cases across nine files**; these counts overlap.

An isolated Electron harness running the actual production floating surface and handlers exercised eight scenario rows across docked/floating modes: layout-only pointer-over preserves the selected pane, independent button focus selects its pane, stale editor focus preserves the selected pane, and keyboard text enters only that pane. No renderer errors were observed. This proves the isolated component/handler path, not the whole app shell, native conversation restoration, or owner acceptance. DN-22 remains open.

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

## Follow-through: terminal evidence and genuinely uncached typing

The owner-only worker checkpoint previously retained the stop reason but dropped the reported turn's iteration counts, token usage, review-required flag, review call IDs and completion state. A real offline checkpoint/inspection reproduction demonstrated that loss. The optional, backward-compatible `terminalEvidence` field now selects only those existing outcome fields; it does not duplicate the final answer, invent aggregate spend or remaining budget, grant continuation, or restore an approval. Absent usage remains unknown and explicit zero stays zero. A later persistence error retains earlier terminal evidence.

Parent execution: the worker inspection and retained-worktree files pass **18 cases**, including legacy records, invalid-evidence rejection without replacement, redacted output, unchanged inspection bytes, owned process interruption and retained Git work. An independent source CLI invocation also displayed the exact synthetic terminal evidence without changing the checkpoint. Its offline guard blocked ancillary loader/startup attempts; this is not a claim of zero attempted subprocesses or network operations. No provider or tool operation was allowed.

A separate real packaged reproduction finally reached the missing startup condition: a conversation created through the runtime API, listed in the sidebar, never cached in the renderer, with its actual open/transcript responses held and **no editor mounted**. The keyboard claimed all 19 characters of `uncached held draft`, but the destination editor was empty after loading. The raw failure is retained separately from the earlier warm-cache prerequisite failure and seven successful core packaged criteria. The production route had no saved owner hint; the earlier source fixture always supplied one.

The narrow repair uses existing known-session ownership as draft-custody evidence, rechecks it for each captured key, and does not create owner hints or change RPC routing. Independent review also reproduced a conflicting ambient-connection case; bare-profile fallback now requires the active local primary draft door, while exact scope/hint/tagged routes retain their existing behavior. Parent reran **20 cold-start cases**, and renderer/Electron typechecks passed. The agent's surrounding six-file run passed 87 cases; counts overlap. Exact rebuilt-package acceptance is recorded separately when executed. No whole-app cold-typing success is claimed from mounted-component tests alone.

**Executed exact-build follow-through:** published `21144177` passed parent MCP/auth/registry/connect/mount 59 cases, worker/retention 18 cases, cold typing 20 cases, runtime/renderer/Electron typechecks, the production help-site build, staged secret scanning, all six changed production files' strict size limits and all five architecture boundaries. The 13-file precommit recovery archive was extracted to memory and matched byte-for-byte. GitHub/local SHA matched after push; protected main stayed unchanged.

The clean-source signed Desktop 0.1.4 rebuilt from that commit then passed the same actual uncached native journey that failed on `19d68ed5`: exact typed draft, caret and focus; separate recipient attachment custody; original draft/file intact on return; no automatic send; zero renderer errors. Two explicit synthetic setup sends only, no paid output or owner account. The [delivery checkpoint](agent-delivery-cleanup-2026-11-17.md) records the exact artifact hashes and distinguishes this six-step proof from the earlier package's seven core criteria. Notarization, normal-app cutover, visual acceptance and live-owner workflows remain unexecuted.

## Worker cancellation: bound auxiliary status queries

The running worker's footer summaries were separate, unawaited model requests. Their throttle timestamp moved only after a reply, so slow summaries overlapped; stopping the reporter cleared its timer and pill but did not cancel requests already started. An actual `spawnSubagent` → durable checkpoint → abort → inspection fixture reproduced three surviving summary requests after the worker stopped. A separate actual OpenAI adapter/SDK → loopback HTTP reproduction reached six concurrent outstanding requests and zero cancellations. No live credentials, owner profiles, paid inference or tools were used.

The existing reporter now owns one in-flight slot and an abort signal. Stop cancels the pending summary, the auxiliary request has a fixed 30-second deadline using the existing interval constant, and late success/failure cannot update the pill after cancellation or worker-ID reuse. A provider that ignores abort keeps the slot until its promise settles, so timeout cannot start overlapping requests behind it. Immediate title display, disabled mode, no eager request, ordinary throttle and failure hints remain unchanged. No new model, configuration, retry policy or worker authority was introduced.

Executed evidence:

- Four new focused cases failed before repair; all 11 reporter cases pass afterward. Parent reran reporter/progress/spawn: **32 passing** cases.
- The actual durable-worker abort replay now starts one summary request, observes one cancellation and zero surviving summary requests. Its synthetic provider's rejection is truthfully recorded as a failed checkpoint with the cancellation error, not relabelled as an interrupted outcome; offline inspection changes no checkpoint bytes and continuation stays disallowed.
- Actual OpenAI adapter/SDK → loopback HTTP: one in-flight request, one observed HTTP abort on stop, zero active requests afterward and no later request or pill update.
- Separate real-wall-clock deadline replay: one HTTP request aborted after **30,009 ms**, no explicit stop, no summary write, and the independent 45-second safety guard did not fire.

This bounds the status-query lifecycle; it does **not** establish aggregate worker spend, parent-budget inheritance, resumable execution, live-provider billing cancellation/refunds, or the ability to force a non-cooperative provider to stop remote work. The declared/remaining-budget and fresh-authority recovery gates above remain unchanged.

## Original-request stream ownership: prevent a false completion

Owner: `SESSION-RESUME-PERSISTENCE-IDEMPOTENCE` ([card](https://trello.com/c/tfDGyOYf)). This is a bounded late-terminal defect, not closure of the older dropped-chunk/stored-reply/attachment-offset acceptance.

Actual production gateway → HTTP/SSE transport → runtime loopback reproduced the failure: request A completed through its real HTTP result while its SSE terminal was held; the owner explicitly started request B; releasing A's original ordered bytes emitted a second completion containing A's answer and appended it under B. Direct original-runtime readback still reported B running and contained no second assistant answer. There were exactly two explicit chat POSTs and no retry POST. Only delivery of actual SSE bytes was delayed; no renderer-store patch or fabricated production success was used. The scripted model and safety kernel were test stand-ins.

The bridge parsed but ignored `turnStarted.requestId`, so an old terminal completed whatever `client.turn` happened to be current. The repair captures the exact request at event attachment, follows matching-session start identities, and rejects old turn content **before** the mapper can mutate plans or other per-turn state. Idempotent reuse preserves the old stream's cursor across HTTP settlement; it never relabels A's backlog as B. Detached callbacks are fenced. Original HTTP-result and identity-validated live-readback ownership remain unchanged; no chat resend was introduced.

Read-only authority stays separate from action authority. A valid usage report naming this attachment's exact stored session can update cumulative accounting in SSE order even after its turn settled; the bridge maps a normalized usage-only frame, never co-packed stale prose or tool data. This preserves multiple instruction reports inside one request and several HTTP completions ahead of their SSE backlog, without inventing an owned-request history or treating final-turn HTTP usage as cumulative session spend. A delayed approval resolution clears only an already-announced exact ID; it cannot introduce another approval request.

Review reproduced one additional compatibility gap: identity-validated adoption into an already-known idle client left that client's old/unknown stream cursor in place. Adoption now installs its proven turn and detaches that old attachment before creating a fresh one. An already-active matching request remains idempotent; conflicting ownership is still rejected by the existing live-session checks. Both old/unknown-cursor controls retain the adopted delta/terminal with no new chat POST, and callbacks from the discarded attachment remain ignored.

Executed evidence includes the original runtime late-terminal RED/GREEN, authoritative B-running readback until its own interrupted result, exact two-POST count, mounted renderer usage-consumer controls, multiple settled-instruction reports, HTTP-ahead ordering, exact old approval cleanup, foreign/missing-session rejection, detached callbacks, adopted/reconnected missed-start controls and matching-active-request idempotence. Focused source checks and final publication are recorded with their exact commit separately; none is a packaged/native UI proof.

Parent's final three stream/live-resume files pass **35 cases**, including the actual runtime loopback. The implementing agent's final renderer/Electron typechecks pass. The initial new test files had generic event-payload narrowing errors; those test-only types were corrected without `any`, suppressed diagnostics or production behavior changes, then checks were rerun. Independent review of the stream boundary found no concrete regression; the parent reviewed the subsequent small known-client adoption helper and executed its controls. Surrounding agent runs overlap these counts. The four non-shipped cards actually worked in this follow-through now carry the evidence date rather than stale September/October update dates; their statuses, Done contracts, dependencies and all shipped history remain unchanged.

Compatibility limit: a legacy stream that supplies no request-start identity and has no exact request bound at attachment does not stream unbound turn content. Its original HTTP result or identity-validated live readback remains authoritative. This is an intentional unverified-stream fallback, not full legacy streaming parity. It does not authorize a retry, new POST, unknown-effect replay or another profile's work.

### Executed current packaged/native follow-through

Clean `8e903828` was rebuilt as signed Desktop 0.1.4, including the worker cancellation and stream/adoption source repairs. The actual packaged native UI passed the bounded delayed-terminal journey: A settled through HTTP while its original parsed IPC terminal was held; explicit B remained running after releasing the original packets in order; one visible A assistant message and original-runtime request/running readback agreed; actual composer Stop ended B through its own interrupted result. Exactly two explicit chat POSTs/model calls in the successful run, no retry and zero renderer errors. Two prior fixture attempts exposed selector ambiguities, not established product regressions; their three additional loopback calls and receipts are retained. This is main-to-preload parsed-packet delay, not raw HTTP-byte delay. No generated event or renderer-store patch was used. Native known-idle adoption, dropped chunks, stored-reply attachment offsets and whole-card acceptance remain open.

That same package also independently passed the seven first-launch/restart criteria and six-step uncached draft/caret/attachment journey. The signed DMG's mounted payload matches all 19,799 files in the tested app. Exact digests and limitations are in the [delivery checkpoint](agent-delivery-cleanup-2026-11-17.md). The local candidate is not a notarized release or a replacement of the normal app/CLI.

The broader stored-tail prerequisite probe made three bounded native attempts without production changes. Actual queued runtime persistence contained the longer A reply and MEDIA attachment while B stayed active; a genuine delta was dropped and later packets held. Returning to the warm known client retained its live partial cache, so stored-reply adoption and delayed-covered-tail release were **not reached**. Five synthetic provider calls in total, one original chat POST per attempt and no second chat POST, no paid inference and zero renderer errors. This is not an attachment-offset RED or GREEN. The next distinct approach is actual source-level gateway hydration, not further UI-selector retries; the whole acceptance remains open.

## Derived-task recovery fence

The actual CLI command handler reproduced both `delegation replay` and `follow-up` appending an assigned task even when the matching private checkpoint explicitly required effect review. The commands used only the summary receipt. The normal team runner can consume such a task as a fresh worker, so uncertainty provenance was lost at queue admission; the reproduction did not claim that an external effect had already been repeated.

Before queueing derived work, the existing command now reads the bounded project-owned checkpoint, checks its recorded parent against the receipt and holds unfinished, invalid or uncertain work. It reuses typed effect-review, unanswered-call and mutator-classification helpers. An answered legacy mutator without a disposition remains uncertain; historical `started` markers with explicit safe settlement do not cause a blanket hold. Read-only and explicitly unstarted controls stay usable. Missing checkpoints retain only coherent legacy `pass`/`done` compatibility. Neither `continuationAllowed:false` alone nor another child's queue-wide hold is treated as exact-child effect evidence.

The two original command regressions failed before repair. Independent review found the missing-disposition false clear, which also failed a narrow regression before correction. Actual compiled CLI entrypoint proof then rejected uncertain replay and follow-up with zero task appends; clean follow-up appended one fresh task. All three runs had zero guarded network/subprocess/synchronous-protected-read attempts, unchanged checkpoint bytes and unchanged normal launcher/selection. This proves admission, not execution of the queued worker. The successful path explicitly restores no transcript, remaining budget or previous approvals. Agent-facing profile/branch authority and genuinely budget-preserving continuation remain open; the current host context does not provide trustworthy profile/branch identity.

The final three focused CLI/recovery/inspection files pass **38 cases**, including corrupt/unfinished/conflicting-parent holds, legacy contradictory receipts and safe settled/read-only/pending controls; runtime typecheck passes. These are narrow source and command-entrypoint results, not installed-app or budgeted-worker-continuation acceptance.

Exact build follow-through: clean source `d4e72e44` was Developer ID signed as Desktop 0.1.4, and its actual bundled CLI independently passed those three admission outcomes with unchanged checkpoints and normal selection. Electron did not load the instrumentation preload, so no packaged network/subprocess/protected-read counter claim is made. The package passed seven native onboarding/restart criteria with one loopback reply and zero renderer errors. Signed ZIP/DMG, checksums and path-free provenance are uploaded as a GitHub **draft**; authenticated DMG readback matches the local digest. The [delivery checkpoint](agent-delivery-cleanup-2026-11-17.md) records exact hashes. Apple authentication still returns HTTP 401; no normal-app replacement, new global CLI selection, stable update or notarized/public release is claimed.

## Dependency-ordered work remaining (updated 24 November)

1. Preserve the executed Desktop 0.1.4 delivery boundary. The normal CLI still selects 19d68ed5; choosing a newer pin requires its own exact candidate proof and fresh cutover authority. The later reporting repair needs separate package/delivery qualification. Production website documentation build is not live help-site publication.
2. Before child continuation or agent-facing inspection: validate expected parent/profile/branch authority, preserve real remaining budgets, reconcile effects and retain review holds. Never restore grants or replay unknown effects.
3. The uncached-typing repair is included in the notarized normal Desktop 0.1.4 delivery. Broader installed/live-owner acceptance remains separate; neither the six-step native fixture nor the isolated floating-pointer proof certifies the whole desktop.
4. Test an exact selected fallback route only with explicit live-probe authority. Never let successful fallback mask a broken entry or claim a static check proves inference.
5. The late-terminal repair is included in the notarized normal Desktop 0.1.4 delivery. Native known-idle adoption and the broader dropped-chunk/stored-reply/attachment-offset proof remain open; the bounded controls above do not close them. Existing session identity/no-second-POST protections stay intact.

MCP, child recovery, reconnect, first-use diagnostics and DN-22 now have bounded ordered checklists. Only the new source-scoped cache-accounting defect is closed; no broad card was blanket-closed and no Building/Next lane was added. Owner/live-account/hardware/visual/unfamiliar-person gates remain separate.

## Delivery boundary

The normal installed/public Desktop is signed/notarized **0.1.4 / d4e72e44**.
The unchanged global CLI launcher separately selects approved **19d68ed5**;
the former selection and dirty checkout remain preserved, without credential
or approval migration. Later source follow-through is not silently promoted
into that pin. See the [delivery checkpoint](agent-delivery-cleanup-2026-11-17.md)
for exact installation, updater and package evidence. The 24 November reporting
source has not received a new package, installation or release. Protected
`main`, repository safeguards and GitHub Actions settings are unchanged.

REA JavaScript analysis was refused by the tool host's approval policy even with filesystem access. No workaround, runtime REA graph or Hopper analysis is claimed. The current work is grounded in inspected source and executed narrow behavior, not an extraction claim.
