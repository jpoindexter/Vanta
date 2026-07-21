# Blind audit: Vanta Desktop

Date: 2026-07-18
Scope: current native desktop shell, work loop, approvals, setup, recovery, packaging, and the evidence used to call those areas shipped.

This is a full 16-framework blind sweep. It is an audit, not an automatic roadmap mutation. Repeated findings are merged below so one defect is not presented as independent corroboration merely because several frameworks found it.

## Executive finding

Vanta Desktop is substantially functional. The source and signed-package flow matrices pass, a real Codex turn uses the correct isolated project, Ask mode gates an actual overwrite, and Telegram transport is live. The strongest counter-position is therefore correct: **the app does not need another wholesale shell rewrite.**

It is not release-clean. Exact chat text is corrupted, the live proof hides that defect behind a timeout, drafts are not scoped or durable, the current local release candidate is unnotarized, and accessibility/external-account/cold-user evidence is incomplete. The roadmap has no active cards for these newly observed defects despite reporting 1,247 shipped cards.

## Severity-ranked findings

### 1. Critical - chat does not preserve exact text

**Observed:** a real response containing `VANTA_DESKTOP_AUDIT_<uuid>` was stored and returned correctly by the API but rendered as `VANTADESKTOPAUDIT_<uuid>`. The current screenshot also shows the same Markdown interpretation affecting user prose. Tool receipts preserve the text.

**Cause:** `src/repl/copy-format-rtf.ts` uses `_[^_\n]+_` as a shared emphasis pattern with no word-boundary guard. `desktop-app/src/message-markdown.tsx` uses that shared HTML conversion for chat.

**Impact:** file names, environment variables, hashes, IDs, exact-output checks, and quoted source material can be changed on screen and in copied rich text. This breaks the primary trust contract even when the agent did the right work.

**Done criterion:** an executed desktop flow round-trips intraword underscores unchanged through user bubble, streamed assistant bubble, final assistant bubble, copy actions, session reload, and export, while standalone `_italic_` still renders as emphasis.

**Found by:** falsification, inversion, red team, ladder of inference.

### 2. High - the official live proof converts a product defect into a 150-second mystery timeout

`scripts/desktop-live-turn-proof.mjs` waits for a rendered assistant element containing the underscore marker. Because rendering mutates that marker, the script times out without reporting the raw API response, current assistant text, root, provider, model, approval, or renderer/server errors.

The real provider and project-root path worked in a separate diagnostic. The proof is therefore a false negative, but it also failed to explain the real UI defect it exposed.

**Done criterion:** the proof separately asserts raw response fidelity, rendered response fidelity, and project-root isolation; on failure it prints all three plus provider/model, pending approval, current messages, and page/server errors within a bounded diagnostic timeout.

**Found by:** calibration, falsification, dunning-kruger, red team.

### 3. High - composer drafts are global, volatile, and can cross task boundaries

`useConversation` owns one `useState("")` draft. Opening another session changes messages and title but does not scope, save, clear, or ask about the draft. Reload or renderer failure loses it; switching sessions can carry it into the wrong task.

For an autonomous coding agent, wrong-task submission is more dangerous than ordinary text loss because the prompt can trigger real file or shell actions in a different context.

**Done criterion:** drafts persist per project + session across relaunch, never appear in a different session, and offer explicit keep/discard/move behavior when changing project context.

**Found by:** inversion, premortem, unknown-unknowns, survivorship bias.

### 4. High - release evidence is split across an old published artifact and a changed local candidate

The current `release/mac-arm64/Vanta.app` has a valid deep Developer ID signature but `spctl` rejects it as `source=Unnotarized Developer ID`. The local 0.9.2 DMG is also rejected and has no stapled ticket. Roadmap history records a separate notarized public v0.9.2 CI artifact; that does not notarize the current post-release code.

**Done criterion:** the exact commit proposed for release runs `desktop:release`, receives Apple acceptance, staples and validates the DMG, passes Gatekeeper after quarantine, and binds the receipt/checksum to that commit.

**Found by:** outside view, calibration, survivorship bias, premortem.

### 5. Medium-high - model and runtime status use the same word for different layers

The live shell can show provider model `gpt-5.5` in the title bar while the runtime strip says `No model`. The latter refers to an optional local runtime profile, but the interface does not name that distinction. A cold operator sees contradictory state.

**Done criterion:** label the layers explicitly (`Agent model` and `Local runtime`) or hide the inactive local runtime row until it is relevant. A cold user can explain which model will answer before sending.

**Found by:** curse of knowledge, cognitive-load review, ladder of inference.

### 6. Medium-high - accessibility is implemented structurally but not proven with assistive technology

Keyboard behavior, roles, focus handling, reduced motion, contrast checks, 200% zoom, and compact layouts have automated coverage. There is no `axe-core`/`@axe-core/playwright` dependency and no physical VoiceOver/NVDA receipt for the production app.

**Done criterion:** zero serious automated accessibility violations across Work, approval, setup, queue, model picker, and session bulk mode, plus one recorded macOS VoiceOver task from launch through file approval and result review.

**Found by:** dunning-kruger, Johari window, calibration.

### 7. Medium - visual and performance regressions can ship while the flow suite stays green

The release suite asserts DOM behavior, geometry, computed colors, and no overflow. It does not run screenshot pixel diffs or enforce cold-start, memory, CPU, bundle, or first-use budgets. The current app is about 548 MB on disk; `app.asar` is about 209 MB and unpacked resources about 63 MB.

**Done criterion:** versioned screenshot baselines for three widths, both themes, approval, recovery, model picker, and Connect; enforce explicit cold-start and package-size budgets with regression thresholds.

**Found by:** outside view, unknown-unknowns, survivorship bias.

### 8. Medium - fixture breadth exceeds real external-account breadth

The packaged matrix proves deterministic provider, MCP, channel, and recovery fixtures. In this audit Telegram alone passed a real connect/poll/disconnect check and the gateway reports it up. No inbound Telegram message to Vanta response round trip was executed. Twenty-one other channels correctly report not configured.

**Done criterion:** keep catalog readiness separate from product readiness; add one redacted end-to-end proof packet per release-required external channel/provider, including inbound event, agent action, outbound result, and failure recovery.

**Found by:** calibration, survivorship bias, falsification.

### 9. Medium - declined crypto compatibility still ships in the desktop dependency graph

The roadmap explicitly records that the operator does not use crypto and parks x402 as dormant compatibility. Nevertheless `@x402/core` and `@x402/evm` remain direct dependencies, and `@x402` is present inside the packaged desktop `app.asar`.

This is not evidence of active crypto behavior. It is an unpriced supply-chain, package-size, audit, and future-maintenance consequence of retaining a declined direction in the main artifact.

**Done criterion:** make an explicit product decision: remove x402 from the default desktop package, isolate it behind an optional package, or document and measure why dormant inclusion is worth its ongoing cost.

**Found by:** Chesterton's fence, red team, unknown-unknowns.

### 10. Medium - roadmap closure currently outruns defect intake

`roadmap.json` reports 1,247 shipped and 11 parked cards, with no active item for exact-message fidelity, session-scoped drafts, live-proof diagnostics, or current-candidate notarization. The prior desktop cards can remain shipped against their documented boundaries, but the product has no visible next queue for newly observed regressions.

**Done criterion:** after operator review, create or reopen the smallest set of non-duplicative cards with executed done criteria; do not rewrite historical shipped claims that were honestly scoped.

**Found by:** bias blind spot, calibration, Johari window.

## What is working

- **Executed:** 24 desktop unit/component test files and 64 tests passed.
- **Executed:** renderer TypeScript check passed.
- **Executed:** source and packaged flow matrices passed shell, run recovery, schema trace, 500-turn sessions, queues, runtime profiles, attachments, safe session operations, Outputs, Connect, three viewports, dark/light, and 200% zoom.
- **Executed:** a real Codex desktop turn read the correct isolated project; provider, root, and tool path were correct.
- **Executed:** Ask mode showed a destructive-overwrite approval and changed the file only after `Allow once`.
- **Executed:** Telegram gateway status is up; channel verification completed connect/poll/disconnect with no failed adapters.
- **Executed:** the current app has a valid deep code signature.
- **Code path + fixture:** project-scoped access modes, queue reconciliation, recoverable session trash, attachment groups, MCP control, provider discovery fallback, and runtime profiles have focused tests and packaged flow coverage.

## Framework-by-framework sweep

| Framework | Result |
| --- | --- |
| Bias blind spot | The incentive to finish a 1,258-card roadmap makes `shipped` an unreliable proxy for current defect absence. External execution found gaps the roadmap did not. |
| Calibration | Claims were split into executed, code-path/fixture, and unverified. Green packaged flows do not establish notarization, external credentials, or assistive technology. |
| Chesterton's fence | Do not delete the runtime strip, inspector, or dormant payment boundary solely because they look extraneous. Their original safety/remote-runtime purposes are documented; simplify or isolate only after preserving those purposes. |
| Consider the opposite | The opposite of “the desktop is broken” survived: current core flows are coherent and broad. The rational move is targeted trust repairs, not another shell rewrite. |
| Curse of knowledge | `Tools 141`, `MCP 0`, `No model`, provider model, kernel, gateway, and runtime are internally meaningful but not self-explanatory to a cold operator. |
| Dunning-Kruger | No claim is made about screen-reader usability, broad provider freshness, or all external connectors without executing those environments. |
| Falsification | The underscore marker was designed to fail visibly and did; it disproved exact-render fidelity and exposed a weak proof harness. |
| Inversion | Reliable ways to destroy trust are visible-text mutation, wrong-session prompt submission, ambiguous model state, and shipping an unnotarized changed candidate. |
| Johari window | Automated suites provide substantial external feedback, but no fresh-context human or physical assistive-technology operator was consulted in this audit. |
| Ladder of inference | Earlier “half-black app” screenshots were not treated as current evidence. A fresh launch showed a full shell; the current defects were isolated to rendering, draft ownership, labeling, and release evidence. |
| Outside view | Desktop agent products commonly fail at packaging, auth drift, external service setup, and state recovery after the happy-path UI is green. Those areas receive the remaining proof priority. |
| Premortem | Likely launch failures: a filename is visibly changed, a prompt is sent in the wrong task, Gatekeeper blocks the candidate, or an external connector passes setup but not delivery. |
| Red team | Electron isolation is strong (`contextIsolation`, sandbox, no Node integration, loopback desktop APIs), but dormant dependencies and a large packaged surface remain attack/maintenance costs. |
| Steelman | Vanta already has the Hermes/Codex-level foundations the user asked for: task rail, streaming, approvals, recovery, Outputs, Connect, MCP, channels, and contextual evidence. Preserve this; stop rebuilding the shell. |
| Survivorship bias | Fixture-backed flows and configured Telegram are the visible survivors. Unconfigured channels, AT users, offline drafts, and Gatekeeper on the changed candidate are the missing population. |
| Unknown unknowns | Category sweep surfaced draft ownership, dual-model terminology, package composition, release-commit binding, performance budgets, provider policy drift, and external proof boundaries. |

## Counterevidence and rejected overclaims

- The inspector does **not** squeeze the work surface at 1024px in the current CSS; it becomes a fixed overlay below 1080px. Earlier geometry interpretation was rejected after reading the responsive rules and rerunning the packaged suite.
- `Tools 141` is the registered catalog, not proof that all 141 schemas are sent to every model turn. `scopeToolSchemas` dynamically narrows provider exposure. The remaining issue is user-facing clarity, not confirmed prompt bloat.
- The current local 0.9.2 artifact being unnotarized does not invalidate the recorded notarized public 0.9.2 CI release. It means the changed local candidate needs a new release proof.
- The Ask/Approve/Full selector is not merely decorative. Ask-mode overwrite was executed through the real desktop UI and kernel approval path.

## Residual unknowns

- No physical VoiceOver operator, cold first-time user, or non-developer operator was observed.
- No full Telegram inbound-to-outbound conversation was sent during this audit; the transport probe polled zero messages.
- No release notarization was submitted because that would create an external release artifact and was outside the audit-only request.
- No pixel-diff baseline or performance budget exists, so visual and resource regressions remain partially invisible.
- Provider model freshness was inspected at the catalog/provider level, not compared exhaustively against every provider's live account entitlements.
- The main desktop API is loopback-only and Electron is sandboxed; a dedicated local-origin/CSRF red-team was not executed.

## Recommended sequence

1. Fix exact-message fidelity and make the live proof diagnose raw versus rendered text.
2. Scope and persist drafts per session/project.
3. Clarify provider model versus local runtime model, then run one cold-user task.
4. Add accessibility and pixel-regression gates.
5. Bind notarization and external connector packets to the exact release commit.
6. Decide whether dormant x402 belongs in the default desktop package.

Companion flow artifact: [`flow-report.html`](../../flow-report.html).
