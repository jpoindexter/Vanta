# Vanta Build Order — Agent-Readable

Source: roadmap.json (generated view — do not edit; regenerate via `node scripts/build-order.mjs`)
Roadmap updated: 2026-08-29
Strategy: STRATEGY.md (one product with Vanta, Engine, and Lab boundaries; roadmap tracks are compatible responsibilities)

## Agent instructions
Build the smallest dependency-ready slice from the two active lanes. Read repo/folder AGENTS.md + CLAUDE.md + STRATEGY.md, preserve protected paths and unrelated dirty work, add or update tests first, and change status only after the card's real Done criterion is executed. Do not commit or push unless the current user instruction explicitly authorizes it. High-risk effects, credentials, kernel/factory edits, merges, publication, and deployment require their own authority.

Ordering: open only; building > next > horizon; rock > pebble > sand; compatible responsibility (Harness > Operator > Solutioning > Extensibility > Cofounder engine); S > M > L; low > medium > high; `after:` dependencies remain ahead of dependents.

The 28 convergence outcomes are an acceptance catalog, not 28 simultaneous projects. `roadmap.json` is the only product-development work database.

## Summary
- total_cards: 1341
- open_cards: 10
- Harness: 4 open
- Operator: 4 open
- Solutioning: 1 open

## Build order

001. [next] DESKTOP-OPERATOR-DOSSIER-HIERARCHY — Desktop operator dossier — outcome-first shell and progressive runtime disclosure
    track: Desktop App | tier: rock | size: M | effort: medium | model: sonnet | after: DESKTOP-SEMANTIC-FOUNDATION-ACCESSIBILITY-REPAIR
    why: Recompose the existing Vanta Desktop capabilities into a quiet operator dossier: chat is home, the current outcome and next decision dominate, durable work has stable destinations, and model/runtime detail stays available without competing with the task.
    done: A first-time operator can identify the current outcome, next action, approval state, active model/access boundary, queued work, and finished artifact without repository knowledge; the primary rail contains only stable destinations; task history and transient activity are separated; runtime telemetry is one compact disclosure; the model picker remains a compact provider-scoped control; command/control overlays never steal focus from background work; Cmd/Ctrl+L focuses the composer; direct manipulation paints immediately and rolls back truthfully on persistence failure; and current Work, Today, Connect, Scheduled, approval, error, empty, reconnecting, degraded, and stale states pass packaged interaction, keyboard, narrow-window, and screenshot proof.

002. [next] DESKTOP-COLD-OPERATOR-RELEASE-PROOF — Desktop cold-operator release proof — one useful task without repo knowledge
    track: Operator | tier: rock | size: S | effort: low | model: sonnet | after: DESKTOP-MODEL-RUNTIME-STATUS-CLARITY, DESKTOP-PROVIDER-AUTH-VALIDATION-RECOVERY, DESKTOP-SEMANTIC-FOUNDATION-ACCESSIBILITY-REPAIR, DESKTOP-OPERATOR-DOSSIER-HIERARCHY
    why: Run the first zero-cost external usability proof: a voluntary non-developer completes the current packaged Desktop work loop without Vanta repository context or paid recruiting, research, CI, hosting, or participant services.
    done: A voluntary, uncompensated fresh non-developer operator gives informed consent, launches the exact packaged release candidate with no Vanta repo context, identifies the model and access boundary, starts one useful task in their own words, handles one approval or recoverable failure, and finds the resulting output; the run records time to first useful result, every confusion point, assistance requested, and the fixes or explicit release waivers, then repeats after blocking fixes with no coaching beyond the in-product UI. No sensitive account data is requested, the participant may stop at any time, no new spend is incurred, and the resulting evidence is labeled as one usability run rather than representative market proof.

003. [horizon] CAPABILITY-GROUNDED-SYSTEM-PROMPT — Capability-grounded prompt — promise only callable tools and routes
    track: Harness | tier: rock | size: S | effort: medium | model: sonnet | after: MCP-EXPLICIT-EMPTY-ALLOWLIST
    why: Assemble the dynamic capability section from the effective post-policy tool and host registry so the agent never promises a tool, provider, connector, or route that the current session cannot call.
    done: For manual, plan, accept-edits, auto, delegated, offline, disabled-server, explicit-empty MCP, and provider-degraded fixtures, the rendered prompt and What can I do surface name exactly the effective callable capability set; stable cacheable instructions remain byte-stable; dynamic capability text is isolated; unavailable actions include one truthful recovery route; and prompt-to-registry property tests catch every invented or omitted capability.

004. [horizon] TRUST-03 — Canonical action envelope and scoped capability
    track: Harness | tier: rock | size: L | effort: high | model: opus | after: TRUST-01, TRUST-02
    why: Bind actor, account, operation, complete normalized arguments, target, recipient, content/attachment hashes, amount or audience, quota, expiry, nonce, attempts, idempotency, state precondition, evidence, and compensation.
    done: Changing any bound actor, account, target, argument, recipient, content byte, attachment, amount, audience, state precondition, expiry, nonce, or replay status after approval produces zero provider calls; capabilities are atomically consumed by the executor and exact drift/replay/crash fixtures pass. R3 uses fresh one-use authority; R4 and R5 grants also bind allowlist, target, account, recipient, quota, budget, expiry, exclusions, cancellation, and review.

005. [horizon] TRUST-05 — Untrusted-content quarantine across email, web, documents, messages, and social input
    track: Harness | tier: rock | size: L | effort: high | model: opus | after: TRUST-01, TRUST-02
    why: Raw external content enters a no-effect intake context and yields a small, validated, provenance-aware structure before any privileged operator receives it.
    done: Malicious email, web, document, attachment, message, social, and tool-output fixtures cannot access credentials, request authority, modify goals or authoritative memory, trigger outbound effects, or escape through links/redirects; the privileged operator receives validated facts and risk signals with source provenance; supported host and restart paths pass.

006. [horizon] TRUST-06 — Safe factory, self-repair, and Vanta Lab production boundary
    track: Harness | tier: rock | size: L | effort: high | model: opus | after: TRUST-01, TRUST-02, TRUST-04
    why: Keep factory, self-repair, auto-research, tuning, experimental organizations, and self-modification absent from production defaults and unable to change the trust boundary.
    done: Flagship journeys run with Lab prompts, tools, workers, credentials, and navigation absent. Incidents may produce only isolated candidates in scrubbed worktrees with bounded diffs, frozen tests/evaluators, brokered Git/effects, receipts, rollback, and holdouts. Unrelated dirty files, evaluator edits, reward-hacked metrics, missing holdouts, push failures, aliases/symlinks, and post-canary regressions halt without success. Default-branch/production promotion, merge, deployment, policy, credential, audit, evaluator, kernel, manifesto, and factory-boundary changes remain human-gated.

007. [horizon] OP-03 — Trustworthy Needs You — deterministic, deduplicated, expiring, and auto-resolving
    track: Operator | tier: rock | size: M | effort: high | model: opus | after: OP-01, TRUST-04
    why: Make the attention contract trustworthy: ordinary conversation creates nothing; only a deterministic blocker with one exact decision or authorization may set WorkItem state to needs human.
    done: Ordinary questions, greetings, status commands, read-only success, and model uncertainty create zero Needs You items; a blocked effect creates one item keyed by WorkItem, exact action, and blocker; it preserves the smallest resolution, source, expiry, and receipt; repeated failures merge into a timeline; setup, approval, replacement, success, stop, or expiry resolves it; actionable quality is at least 95% and duplicates below 1% in executed journeys.

008. [horizon] UX-04 — Contextual Review, first-run usefulness, and cross-host accessibility contract
    track: Operator | tier: rock | size: L | effort: high | model: opus | after: UX-03, TRUST-04, DESKTOP-OPERATOR-DOSSIER-HIERARCHY
    why: One contextual Review surface renders Activity, Changes, Outputs, Evidence/Approvals, and durable background-session state; the supported launch path and generated artifacts satisfy the disability-led universal-design contract.
    done: The supported launch path reaches one persisted/resumable useful local outcome within ten minutes without Gmail/Calendar or diagnosis disclosure. Keyboard, focus including Cmd/Ctrl+L composer focus, screen reader, high contrast, common color-vision deficiencies, non-color meaning, reduced motion, density, notifications, optional streaming/auto-scroll, sound, stable layout, preserved reading position, summary-first detail, literal state, and narrow resize pass on the active build. Background events update unread, progress, and settlement state without navigating or stealing focus; session switch and restart preserve unread boundaries, queues, drafts, scroll anchors, and exact resume; optimistic direct manipulation rolls back visibly on persistence failure. Concrete aphantasia-safe previews and accessible charts/media pass. Support reason/scope/lifetime/reset/dismissal, multidimensional capacity including unknown, quiet hours, interruption budgets, and exact resume are consistent across Desktop, TUI, messaging, background, restart, and safe mode.

009. [horizon] LIFE-02 — Quarantined read-only morning orientation
    track: Operator | tier: rock | size: L | effort: high | model: opus | after: TRUST-05, OP-01, OP-03, UX-03
    why: Use a bounded durable cursor over quarantined email and calendar to extract urgent items, commitments, reply needs, waiting state, and FYI without creating or executing an external commitment.
    done: A test mailbox/calendar and then an explicitly authorized R0 Observe account produce a concise sourced brief with no invented commitment; Gmail and Calendar use separate incremental scopes; malicious content cannot reach effects or secrets; WorkItems deduplicate and retain source; timezone and freshness are visible; restart resumes the cursor without loss or duplication; usefulness is measured; no send, invite, archive, label, or Drive mutation is required.

010. [horizon] GROW-01 — Phase-0 trusted-continuity evidence lane — voluntary interviews, pilots, burden, and retention
    track: Solutioning | tier: rock | size: S | effort: medium | model: opus | after: DESKTOP-COLD-OPERATOR-RELEASE-PROOF
    why: After the first cold-operator proof, test the same capture → recommend/prepare/act → wait/resume → verify/close contract across bounded life-and-work tasks using voluntary, zero-cost interviews and pilots.
    done: Ten voluntary functional-problem interviews and five voluntary, accessibly supported continuity pilots include neurodivergent/disabled lived experience and situational burden without diagnosis gating; assisted/unassisted use, task domains, acquisition source, weeks-three/four repeat loops, burden change, verified outcomes, founder support minutes, incidents, non-return reasons, and the selection and representativeness limits of an uncompensated cohort are recorded; unknowns remain unproven; a precommitted continue/change/park date and zero-expense ceiling are recorded; fixtures cannot close the card.
