# Vanta Build Order — Agent-Readable

Source: roadmap.json (generated view — do not edit; regenerate via `node scripts/build-order.mjs`)
Roadmap updated: 2026-08-02
Strategy: STRATEGY.md (one product with Vanta, Engine, and Lab boundaries; roadmap tracks are compatible responsibilities)

## Agent instructions
Build the smallest dependency-ready slice from the two active lanes. Read repo/folder AGENTS.md + CLAUDE.md + STRATEGY.md, preserve protected paths and unrelated dirty work, add or update tests first, and change status only after the card's real Done criterion is executed. Do not commit or push unless the current user instruction explicitly authorizes it. High-risk effects, credentials, kernel/factory edits, merges, publication, and deployment require their own authority.

Ordering: open only; building > next > horizon; rock > pebble > sand; compatible responsibility (Harness > Operator > Solutioning > Extensibility > Cofounder engine); S > M > L; low > medium > high; `after:` dependencies remain ahead of dependents.

The 28 convergence outcomes are an acceptance catalog, not 28 simultaneous projects. `roadmap.json` is the only product-development work database.

## Summary
- total_cards: 1331
- open_cards: 9
- Harness: 4 open
- Operator: 4 open
- Solutioning: 1 open

## Build order

001. [next] TRUST-01 — Universal effect-path inventory and one trusted action gateway
    track: Harness | tier: rock | size: L | effort: high | model: opus | after: TRUST-02
    why: Inventory filesystem, shell, Git, network, credentials, hooks, plugins, MCP, scheduler, workers, Desktop, connectors, factory, and self-repair effects; route every consequential effect through one authoritative gateway without deleting working capability.
    done: The inventory names every effect path, actor, account, credential, normalization, policy decision, executor, receipt, compensation, and bypass test; unmediated effects equal zero in executed adversarial coverage. Gmail to/subject reject CR/LF before MIME construction and authorization hashing; Gmail, Calendar, and Drive scopes are separate and incremental; life mutations use preconditions, idempotency, immutable provider IDs, readback, and compensation. Compatibility adapters preserve provenance, measurement, cutoff, and rollback and never become a second policy boundary.

002. [next] OP-01 — Minimum operator spine — WorkItem, Run, Approval, Receipt, follow-up, and resume
    track: Operator | tier: rock | size: L | effort: high | model: opus | after: TRUST-04
    why: Define only the stable operational spine required by the first continuity slice. Existing tasks, tickets, schedules, sessions, runs, and boards remain behind read-only projections until reconciliation proves a safe cutover.
    done: Every flagship story represents desired outcome, source, exact nine-state WorkItem lifecycle, Run, Approval, Receipt, provenance memory, next action, owner, wait condition, follow-up, time/capacity fit, blocker, artifacts, and resume context without another user-facing store. A read-only projection preserves legacy source and ID; count/hash reconciliation survives restart; corrupt or unreadable stores remain visible; no writer cutover occurs without bounded dual-write, rollback, and retirement evidence.

003. [next] GROW-01 — Phase-0 trusted-continuity evidence lane — interviews, pilots, burden, retention, and price
    track: Solutioning | tier: rock | size: S | effort: medium | model: opus
    why: Begin commercial and usefulness learning manually: test the same capture → recommend/prepare/act → wait/resume → verify/close contract across bounded life-and-work tasks with chronic and situational executive burden.
    done: Ten functional-problem interviews and five accessibly supported continuity pilots intentionally include neurodivergent/disabled paid co-design and situational burden without diagnosis gating; assisted/unassisted use, task domains, acquisition source, weeks-three/four repeat loops, burden change, verified outcomes, payment or explicit price/value rejection, revenue, founder support minutes, incidents, and non-return reasons are recorded; unknowns remain unproven; a precommitted continue/change/park date and weekly time/expense ceiling are recorded; fixtures cannot close the card.

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
    track: Operator | tier: rock | size: L | effort: high | model: opus | after: UX-03, TRUST-04
    why: One contextual Review surface renders Activity, Changes, Outputs, and Evidence/Approvals; the supported launch path and generated artifacts satisfy the disability-led universal-design contract.
    done: The supported launch path reaches one persisted/resumable useful local outcome within ten minutes without Gmail/Calendar or diagnosis disclosure. Keyboard, focus, screen reader, high contrast, common color-vision deficiencies, non-color meaning, reduced motion, density, notifications, optional streaming/auto-scroll, sound, stable layout, preserved reading position, summary-first detail, literal state, and narrow resize pass on the active build. Concrete aphantasia-safe previews and accessible charts/media pass. Support reason/scope/lifetime/reset/dismissal, multidimensional capacity including unknown, quiet hours, interruption budgets, and exact resume are consistent across Desktop, TUI, messaging, background, restart, and safe mode.

009. [horizon] LIFE-02 — Quarantined read-only morning orientation
    track: Operator | tier: rock | size: L | effort: high | model: opus | after: TRUST-05, OP-01, OP-03, UX-03
    why: Use a bounded durable cursor over quarantined email and calendar to extract urgent items, commitments, reply needs, waiting state, and FYI without creating or executing an external commitment.
    done: A test mailbox/calendar and then an explicitly authorized R0 Observe account produce a concise sourced brief with no invented commitment; Gmail and Calendar use separate incremental scopes; malicious content cannot reach effects or secrets; WorkItems deduplicate and retain source; timezone and freshness are visible; restart resumes the cursor without loss or duplication; usefulness is measured; no send, invite, archive, label, or Drive mutation is required.
