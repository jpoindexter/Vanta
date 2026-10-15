# Vanta Desktop: chat-first, capability-complete revamp

> Historical September 8 planning record. The owner's October 2 correction
> expands this to the whole ambient workflow, uses white/grey and Vanta violet
> by default, and explicitly requests optional mini/avatar access. Current
> authority, implementation and evidence are in the
> [ambient workflow record](desktop-ambient-workflow-2026-10-02.md).
> Counts, palette, statuses and prohibitions below describe this earlier task,
> not the current canonical roadmap or later Git publication authorization.

Decision owner: Jason. Status: planned; no application implementation or publication in this reconciliation.

## Outcome and controlling decision

Improve the existing Vanta Desktop, not replace its agent or fork another product.
The desired experience follows Codex's familiar conversation layout and interaction
conventions, with Vanta's black, bone, and violet palette. Preserve Vanta's existing
generalist capabilities, integrations, providers, memory, skills, scheduling,
approval boundaries, and disability-led accessibility requirements.

When someone wants to think, ask, or do something, they can start a chat immediately,
then find their work and capabilities without reconstructing context or using the terminal.
Projects and tracked tasks are optional. An ordinary conversation is not a failed task.

The user approved this direction, not every detail of the prototype. The existing
R2 interactive artifact is a simulated structural reference; hover actions and the
branded visual revision are still missing. Its 155 earlier prototype assertions do
not prove the production app, design acceptance, or unfamiliar-person usability.

## Now, Next, Later

- **Now:** finish the branded interactive reference and inventory the existing UI-to-runtime contracts and capability entry points. No live account work.
- **Next:** prove one real chat in the existing app: create, send, stream, stop, switch away/back, quit/reopen, resume. Then apply the selected design to that proven path.
- **Later:** carry the same shell across projects, files/review, integrations and recovery; run the exact packaged regression matrix. The unfamiliar-person test remains deferred.
- **Re-entry:** read this plan and DECISIONS.md, refresh the selected full checkout and dirty state, read folder instructions, then start Phase 0. Do not build from the partial wireframe workspace.
- **Done:** the exact installed candidate executes the acceptance paths below with no lost capability, data, or authority. Planning or prototype completion cannot ship a card.

## Board reconciliation: no new cards

All 1,361 records and 1,288 shipped records are retained. Eight existing records are
amended; no IDs are added or deleted. Old acceptance evidence is retained in notes.

| Existing card | Reconciliation and boundary |
| --- | --- |
| DESKTOP-OPERATOR-DOSSIER-HIERARCHY | Parked → Next; repurpose the unshipped outcome-first shell as the chat-first revamp. Earlier dossier proof is historical, not proof of the new contract. |
| DESKTOP-CONNECTION-PROJECT-LIFECYCLE | Stay Parked; optional projects, native folder selection when needed, original connection ownership; no engine replacement. |
| DESKTOP-NATIVE-RESILIENCE-SHELL | Stay Parked; preserve Electron/native bridge and app identity; future native hardening remains separately bounded. |
| UX-04 | Stay Horizon; contextual panels, hover/focus/touch access and cross-host accessibility; no mandatory dossier for chat. |
| DESKTOP-QUICK-CAPTURE | Stay Parked; capture may create a conversation, not a required task. Extra capture window is optional. |
| DESKTOP-COLD-OPERATOR-RELEASE-PROOF | Stay Parked; eventually test the new exact candidate, not the superseded dossier. No participant work now. |
| BROWSER-WORKFLOW-ACTION-BOUNDARY | Next → Horizon for capacity; unchanged safety gate before any new authenticated browser or mutation path. |
| LIFE-02 | Horizon → Parked; dependency-blocked morning orientation yields the open slot; reactivate after its trust dependencies and owner selection. |

Next contains the Desktop card plus Git probe isolation, instruction-write approval,
and failure-atomic local-state recovery. Nothing is Building. Keep at most 12 open,
4 Next, and 2 Building; development uses one safe Operator lane and at most one
urgent Trust lane. Do not start four cards in parallel. Keep roughly one fifth of
each implementation slice available for regression/recovery, not additional features.

## Dependency-ordered implementation slices

| Phase | Work in the existing app | Observable exit criterion |
| --- | --- | --- |
| 0. Baseline and visual contract | Inventory routes, commands, overlays, bridge methods, persistence owners, current capability availability, brand tokens, and packaged baseline. Build the Codex-like visual prototype with Vanta colors and hover interactions; Jason reviews it. | Every capability has a current entry point, future entry point, owner and acceptance path. One reviewed new-chat, active-chat, hover/menu, queue, and side-panel flow; limitations labeled. No new runtime/store. |
| 1. Real conversation slice | Reuse main.tsx, chat.tsx, composer.tsx, state.ts, api.ts and current session adapters. New chat without project/outcome; no implicit task. | One live Vanta turn sends/streams, stops, retains draft/attachments/queue during switching, resumes after restart, and cannot execute twice. Run in isolated test state; synthetic tests do not count as live provider proof. |
| 2. Sidebar and composer | Refine rail.tsx, session pinning/safe operations, overlays.tsx, queued-turns.tsx and existing model controls. | Search/open/rename/pin/unpin/archive/restore work on the intended chat. Hover/focus preview shows full title, project or standalone-chat context, truthful time/state, and execution location only if known. Separate action targets never navigate accidentally. Escape closes; focus restores; pointer can enter the card; touch has explicit controls. Queue text remains visible, editable and removable; stop never silently submits it. |
| 3. Contextual workspace | Reuse canvas.tsx, file-context, project-folder-picker, run library, and existing Review/approval surfaces. | Files, Browser, Review and Activity open beside the conversation; resize/close restore layout and focus. Safe file previews and native dialogs work. Changing projects cannot move a running operation's root. Browser additions remain blocked behind BROWSER-WORKFLOW-ACTION-BOUNDARY; approval UI cannot widen authority. |
| 4. Capability continuity | Rehome settings, connections, integrations, memory, skills/plugins/MCP, schedules, voice and support controls through progressive disclosure. | Capability matrix has no unexplained deletion, fake connected state or stranded route. Existing supported tools remain usable via their established authority paths. Unsupported or unconfigured features have truthful recovery. TUI/CLI continue using the same agent and state. |
| 5. Exact packaged proof | Build an isolated candidate, run regression, accessibility and restart/rollback proof. Compare with the recorded baseline. | Exact candidate hash, head, commands/exits and receipts retained; all in-scope journeys pass. No focus theft, lost queue/draft, secret leakage, permission bypass, or unexplained performance regression. Installed-app replacement requires explicit scope; human beta proof remains outstanding. |

These phases are checklists within existing roadmap ownership, not six competing
product cards or six new stores. A failure stops the dependent phase; fix that
regression and repeat the affected path before proceeding.

## Capability retention and evidence ownership

| Capability to preserve | Existing owner / implementation starting point | Required regression |
| --- | --- | --- |
| Chat, markdown, attachments, clipboard | DESKTOP-CODEX-CHAT-SURFACE; DESKTOP-MESSAGE-FIDELITY-INTRAWORD-UNDERSCORES; DESKTOP-RICH-CLIPBOARD-PASTE; chat/composer modules | Exact text, long paste, attachment failure and stream interruption; input stays editable. |
| Session drafts, queues, pins, history | DESKTOP-SESSION-DRAFT-OWNERSHIP; DESKTOP-QUEUED-TURN-EDITOR; DESKTOP-PINNED-TASK-ORDER; session-view-state.ts | Two concurrent chats, distinct drafts and queues, archive/restore, unread/scroll restart; no cross-chat leakage. |
| Providers and model/effort/speed | DESKTOP-MODEL-RUNTIME-STATUS-CLARITY; DESKTOP-PROVIDER-AUTH-VALIDATION-RECOVERY; overlays.tsx | Capability-derived choices, cancel/apply, session/project defaults, expired auth, local-model unavailable. No fabricated provider options. |
| Files, browser, artifacts and review | UX-04; BROWSER-WORKFLOW-ACTION-BOUNDARY; canvas.tsx | Side panel follows selected chat, safe previews, explicit cwd, approved action identity and truthful receipts. |
| Work, continuity and Needs You | OP-01; TRUST-04; OP-03; continuity-state/view and task-dossier.tsx | Chat does not create a WorkItem; explicit tracking retains canonical IDs/lifecycle. Never call provider acknowledgment verified readback. |
| Memory, skills, plugins, MCP, scheduling, integrations and voice | Existing registries and supported routes; integrations-state.ts, mcp-connectors-view.tsx, runtime-profiles.tsx, sound-settings.tsx | Inventory every actual route in Phase 0; retain connection/auth ownership, cancel/revoke controls, dormant behavior and setup/recovery. Do not infer universal live support. |
| Accessibility and recovery | UX-04; DESKTOP-SEMANTIC-FOUNDATION-ACCESSIBILITY-REPAIR; DESKTOP-NATIVE-RESILIENCE-SHELL | Keyboard, VoiceOver, no color-only state, readable contrast, reduced motion, text zoom, narrow window, manual scroll/stream controls, offline and failed-save recovery. |

Shipped cards remain historical owners: this revamp must rerun their relevant
regressions, not edit their shipped status or claim the new surface inherits proof.

## Reuse policy and architecture guardrails

Phase 0 includes a bounded reuse comparison, not two competing full-shell builds.
Compare the existing Vanta implementation with one relevant Hermes component on:
UI-to-runtime contracts, session identity, streaming/cancellation, persistence,
approvals, accessibility, dependency/license burden, and ongoing update ownership.
Record exact candidate files and the adapters that would be required. If promising,
prove one reversible component in the Phase-1 chat slice before widening reuse.
Include adaptation, integration tests, and maintenance in the effort comparison;
source availability alone does not establish a faster delivery. Stop the import
if it requires another agent runtime/store or drops any capability in the retention
matrix. The default remains an in-place Vanta redesign until that proof justifies
a narrower reuse decision.

- Vanta remains the runtime, host, identity, stores, policy and customer-facing product. No wholesale Hermes shell fork, new Python runtime, or Codex-engine migration is selected.
- Codex is the visual/interaction reference. Public openai/codex at `2cbbf0c9b542a36a1c3284b5e804917635b6f666` exposes the Apache-2.0 harness/App Server, not the separately installed desktop renderer. Inspecting a bundled renderer is not permission to redistribute it.
- Hermes at `c8aa5608c24e3636e77c267650c0f1f52e44adb0` includes an MIT desktop and shared transport. Small reusable components are candidates only after coupling, license, notices, dependency and security review. Record exact files/revisions and modifications. Do not import branding, bootstrap/update services, accounts, bot/fleet UI or extra stores.
- Prefer the existing Vanta component when adaptation costs less than importing and maintaining upstream code. Reuse decisions require a working slice, not aesthetic similarity.
- Vanta colors come from the existing brand source; do not introduce a competitor palette. Visual polish follows the reviewed interaction contract.
- No changes to Rust, protected factory, MANIFESTO.md, stored user authority, live credentials or operator data. No new spend, paid Actions, release, deployment, notarization, push, tag or merge in this planning task.

Sources: [Codex source](https://github.com/openai/codex/tree/2cbbf0c9b542a36a1c3284b5e804917635b6f666),
[Hermes Desktop](https://github.com/NousResearch/hermes-agent/tree/c8aa5608c24e3636e77c267650c0f1f52e44adb0/apps/desktop),
and Jason's explicit 2026-09-08 direction. The repository reviews were bounded;
neither is claimed fully audited or imported.

## Verification and review rules

For each future source slice: relevant colocated tests first, runtime/renderer
typechecks, size/architecture checks, production Desktop build, exact packaged
interaction replay, secret/protected-path scans and diff checks. At final candidate:
full TypeScript suite, existing Rust tests without Rust edits, roadmap/schema/graph
checks, keyboard/VoiceOver/reduced-motion/zoom proof and before/after screenshots.
Use recorded local commands from the chosen checkout; do not invent unavailable scripts.

Measure cold start to usable composer, long-transcript typing/scroll latency,
stop acknowledgment and switching/re-entry against the Phase-0 baseline. Agree
budgets before implementation; a >10% reproducible regression requires explanation
and owner acceptance or a fix. Record hardware and sample counts, not a single timing.

Review after every phase and whenever capability parity, data ownership or authority
would change. Jason owns visual acceptance and scope exceptions. Developer tests
establish behavior only on executed paths; no human comprehension, distribution,
cross-platform or external account claim follows from them.

Planning uncertainty: reuse/coupling inventory is not yet complete, the visual
revision is not approved, and production continuity is not replayed on a redesigned
candidate. For Phase 0 only, the provisional planning range is 0.5 day best,
1–2 working days realistic, 3 days if capability gaps require tracing. Checkpoint
after the inventory and first visual flow; do not estimate the whole redesign until
the real chat slice reveals coupling. No delivery-date commitment is implied.
