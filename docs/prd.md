# Vanta product requirements

**Status:** Current product definition as of 2026-07-30
**Authority:** `MANIFESTO.md` → append-only `DECISIONS.md` → `STRATEGY.md` → this PRD
**Work database:** `roadmap.json`
**Acceptance:** `docs/product-acceptance.md`

Earlier phase checklists in this file described Vanta v0/v1 construction. They are
historical and remain recoverable through Git history, releases, `CHANGELOG.md`,
and shipped roadmap records. They are not the current build queue.

## Product statement

**Vanta is a full-capability, life-integrated, progressively autonomous personal
AI operator for the general human experience. It can do the broad work expected
of a Hermes/OpenClaw-class agent, while specializing in trusted continuity and
responsibility transfer when human attention, memory, time, and executive
function are finite. Neurodivergent and disability experience supplies curb-cut
universal-design requirements without limiting the audience.**

## Problem

People routinely have more intentions, obligations, relationships, transitions,
and opportunities than their available attention and executive function can
carry to completion. Capacity varies with stress, sleep, illness, pain, aging,
caregiving, parenting, grief, disability, workload, unfamiliar situations, and
ordinary interruption.

General agents can perform many isolated tasks. They still leave the person to
reconstruct context, classify work, repeat instructions, supervise permissions,
remember follow-up, and decide whether anything actually finished.

Vanta’s wedge is trusted continuity and responsibility transfer. It should own
the repeatable logistics:

```text
capture → understand outcome → recommend or prepare → act within authority
→ verify → wait and follow up → resume → truthfully close
```

## Audience and design method

The audience is general. Named use cases and cohorts are evidence, not market
boundaries.

Neurodivergent and disabled people remain voluntary co-design contributors because their lived
constraints expose failures earlier and more sharply. Vanta does not infer diagnosis,
require disclosure, or generalize an uncompensated volunteer sample into representative
market proof. Autism, ADHD, aphantasia,
color-vision, mobility, sensory, cognitive-load, and executive-function
requirements are non-negotiable source constraints.

Apply the curb-cut effect:

- no diagnosis gate or diagnosis inference;
- inclusive behavior available by default;
- capture without forced taxonomy;
- concrete representation and exact previews;
- one recommendation and at most three visible choices;
- initiation, time, transition, waiting, follow-up, and re-entry support;
- literal, non-shaming state;
- negotiated preferences with visible reason, scope, lifetime, reset, and host
  coverage;
- accessible generated artifacts, not only accessible application chrome.

## Product surface

Vanta is one operator identity across supported Desktop, TUI/CLI, messaging,
background, and future hosts. All hosts should share one work state, memory
contract, trust model, and receipt semantics.

The default interaction is one conversation shell:

- **Today** — one current outcome, genuine Needs You items, and at most three
  next items;
- **Inbox** — messy captures that survived without forced commitment;
- **Projects** — outcomes, history, and an optional WorkItem projection;
- **Review** — contextual Activity, Changes, Outputs, and Evidence/Approvals.

The default input is:

> **What do you want off your mind?**

The user should not have to choose a model, tool, worker, agent, mode, host,
worktree, queue, or workflow first.

## Capability floor

Vanta must preserve representative generalist competence across:

- research, web, browser, and information synthesis;
- files, documents, spreadsheets, presentations, and knowledge work;
- coding, debugging, software delivery, and technical operation;
- email, calendar, messaging, scheduling, and communication;
- life administration, home routines, reminders, and coordination;
- employment, applications, interviews, career, and income work;
- business research, offers, customers, clients, and operations;
- relationships, permitted public-source opportunity research, and follow-up;
- design, writing, social content, YouTube, audio, video, film, and other media;
- skills, plugins, MCP, APIs, workers, background jobs, automation, and future
  capabilities not yet enumerated.

Broad capability is table stakes. It is selected by intent and hidden through
progressive disclosure, not deleted to make the interface look narrow.

## Internal boundaries

- **Vanta** — the customer-facing operator and continuity contract.
- **Vanta Engine** — policy, action gateway, models, tools, jobs, triggers,
  workers, memory, skills, plugins, MCP, recovery, and extensibility.
- **Vanta Lab** — quarantined factory, auto-research, tuning, experimental
  organizations, self-modification, and speculative autonomy.

These are boundaries under one product strategy. Lab is absent from production
defaults and cannot change policy, credentials, evaluators, audit state, or the
root of trust. Multi-agent fan-out is an internal capability for one owner, not
the product identity or a multi-tenant company platform.

Capability packs—Research, Life Admin, Build, Business/Growth,
Media/Publishing, and Messaging/Social—begin as dormant manifests or projections
over existing registries. An inactive pack contributes zero prompt fragments,
active schemas, workers, requested credentials, or persistent navigation.

## Canonical product nouns

- **Conversation** — interaction and history.
- **Outcome** — what the user wants to be true.
- **WorkItem** — a commitment or next action toward an outcome.
- **Run** — one foreground or background attempt to advance a WorkItem.
- **Trigger** — a time or event condition that queues a Run.
- **Action** — one proposed side effect.
- **Capability** — exact, expiring authority for an Action or narrow workflow.
- **Receipt** — policy, execution, verification, and compensation evidence.
- **Artifact** — generated or changed content.
- **MemoryRecord** — a sourced fact, preference, learning, or summary.
- **CapabilityPack** — dormant vertical implementation selected by intent.

Boards, tasks, tickets, plans, Today, schedules, and legacy Jobs are projections
or internal implementation details—not peer user truths. A legacy Job may map
to one canonical Run, but cannot define another lifecycle.

## WorkItem minimum contract

```text
WorkItem {
  version: 1
  id: non-empty string
  outcome: non-empty string
  source: non-empty provenance string
  state: draft | queued | running | waiting | needs human
       | stopped | failed | unverified | verified
  runId?: non-empty string
  owner?: non-empty string
  waitCondition?: non-empty string
  nextAction?: non-empty string
  resumeContext?: non-empty string
  updatedAt: ISO-8601 timestamp
}

Run {
  version: 1
  id: non-empty string
  workItemId: non-empty string
  state: WorkItem.state
  actor: non-empty string
  startedAt?: ISO-8601 timestamp
  settledAt?: ISO-8601 timestamp
}

Approval {
  version: 1
  id: non-empty string
  workItemId: non-empty string
  runId: non-empty string
  actionSha256: 64 lowercase hex characters
  state: requested | approved | denied | expired
  at: ISO-8601 timestamp
  expiresAt?: ISO-8601 timestamp
}

Receipt {
  version: 1
  id: non-empty string
  workItemId: non-empty string
  runId: non-empty string
  action: non-empty capability/tool name
  disposition: none | confirmed | denied | expired | unknown | compensated
  verification?: unverified | verified
  evidence?: non-empty string
  at: ISO-8601 timestamp
}
```

Legal WorkItem transitions are:

```text
draft       -> queued | stopped
queued      -> running | waiting | needs human | stopped | failed
running     -> waiting | needs human | stopped | failed | unverified | verified
waiting     -> queued | running | needs human | stopped | failed | unverified | verified
needs human -> queued | running | stopped | failed
stopped     -> queued
failed      -> queued | running
unverified  -> queued | running | waiting | failed | verified
verified    -> terminal
```

Retry never follows an `unknown` effect blindly. It first reconciles provider or
artifact state and either records `verified`, keeps `unverified`, or records a
compensation receipt. Resume preserves the same WorkItem ID and provenance;
each attempt gets a distinct Run in migrated stores. Only `verified` can create
accomplishment memory.

The UI projects Captured = `draft`; Now = `queued` or `running`; Waiting =
`waiting`; Needs You = `needs human`; Done = `verified`. These labels are not
additional states. Legacy stores must be projected read-only before migration. Preserve source IDs,
compare counts and hashes, route one writer at a time, bound any dual-write,
prove restart and rollback, then freeze and eventually retire the adapter.

## Trust and action contract

Vanta’s intended trust zones are:

1. **Untrusted intake/planner** — raw external content is data, has no effect
   authority, and yields provenance-aware structured facts.
2. **Trusted action gateway** — canonicalizes exact operations, applies policy,
   mints and consumes narrow capabilities, brokers credentials, reserves
   idempotency, executes, reconciles unknowns, and records compensation.
3. **Provenance/evidence store** — retains immutable events, provider readbacks,
   and memory claims linked to sources.

Every consequential action must bind:

```text
actor, account, operation, normalized target and arguments,
recipient, content and attachment hashes, amount or audience,
quota, expiry, nonce, attempts, idempotency, state precondition,
evidence requirement, compensation
```

Changing any bound field after approval produces zero provider calls.

External content cannot grant authority, access credentials, modify policy or
goals, write authoritative memory, or trigger outbound effects.

## Truthful state and receipts

All hosts and memory writers use the exact WorkItem lifecycle above. Receipt and
Action records may additionally carry the dispositions `denied`, `expired`,
`unknown`, and `compensated`; those are never WorkItem states.

Unknown effects are reconciled, never blindly retried. Assistant prose, a stop
reason, a file edit, or a green adjacent test cannot create a verified
accomplishment.

## Progressive autonomy

Autonomy is earned per workflow and domain. `R0`–`R5` are reserved exclusively
for this ladder:

1. R0 — Observe: read, classify, and report; no mutation.
2. R1 — Recommend: identify the outcome and propose one next action; no mutation.
3. R2 — Prepare: create private, reversible drafts, tasks, notes, reminders, or isolated artifacts.
4. R3 — Confirm: show the exact action preview and require fresh one-use authority.
5. R4 — Delegate: run an allowlisted recurring workflow within explicit target, account, recipient, quota, budget, expiry, exclusions, cancellation, and review bounds.
6. R5 — Autonomous delegate: in a proven bounded domain, initiate, chain, coordinate, communicate with permitted parties, monitor, reconcile, follow up, and recover without per-step approval.

Consequence is classified separately as `E0`–`E5` and never grants autonomy.

A proven autonomous delegate may notice conditions, initiate and chain actions,
coordinate services, communicate inside approved relationships and recipients,
monitor, reconcile, follow up, and recover without per-step approval. Grants
remain user-owned, scoped, visible, revocable, budgeted, interruptible, and
automatically demoted after failure or drift.

Never unattended:

- policy, credential, evaluator, audit, or root-of-trust changes;
- credential export;
- permanent deletion without tested backup;
- legal or major financial commitments;
- broad public or customer messaging;
- default-branch or production self-merge;
- disabling stop, revocation, or audit.

## Flagship journeys

Every journey must close as:

```text
trigger → capture → interpret → commit → prepare/act → authorize
→ effect → verify → wait/follow up → close → remember
```

Required evidence journeys include:

1. messy capture without forced classification;
2. one cross-source Today recommendation;
3. prepared initiation and time/transition support;
4. read-only morning orientation from quarantined email/calendar;
5. malicious external content unable to reach privileged action;
6. exact-recipient send with idempotency and provider readback;
7. durable waiting, follow-up, and reply closure;
8. overwhelm reduced to takeover, first step, or safe park;
9. restart re-entry from last verified state;
10. cited research ending in a decision or next action;
11. job/client work grounded in verified experience, without mass outreach;
12. idea-to-business experiment with a continue/change/park rule;
13. coding, design, and media work closing with artifact and evidence;
14. self-repair producing only an isolated candidate and evidence;
15. stale profile/skill/identity migration with backup, diff, opt-in, provenance,
    rollback, and no silent user-state mutation.

The complete 38-story reconciliation suite is recorded in
`docs/strategy-realignment-2026-07-30.md`.

## Product and evidence budgets

| Dimension | Target |
|---|---:|
| Customer-facing products | 1 |
| Default shell | 1 |
| Persistent human concepts | Today, Inbox, Projects |
| Visible alternatives | ≤3, with 1 recommendation |
| Open build-order cards | ≤12 |
| Next | ≤4 |
| Implementation-ready | ≤6 |
| Development WIP | 2 |
| Default tool schemas | target ≤12 |
| Active schemas after intent expansion | target ≤24 |
| Baseline prompt | target ≤10K; ceiling 15K |
| Canonical user work owner | 1 |
| Unmediated effect paths | 0 |
| Effectful actions with typed receipts | 100% |

Product progress is measured by safety, executive burden transferred, truthful
closure, restart/re-entry, retained use, support cost, payment evidence, and
real-world outcomes—not tools, commands, cards, downloads, or model narration.

## Current implementation truth

The July 30 audit confirmed substantial engineering and a large executed test
suite, but also identified critical gaps between product claims and enforcement:

- project hook/control-plane writes can create unmediated host execution;
- subprocess and project-file paths can expose credentials;
- audit signing material is reachable from agent-controlled project state;
- TypeScript and extension effect paths are not all mediated by a hard
  capability boundary;
- untrusted email/web/document content is not fully quarantined;
- approval payloads and completion semantics are inconsistent across hosts;
- several user work stores and queues lack one authoritative facade;
- published dependency and release claims have drifted.

This PRD states the required product. It does not mark those gaps fixed.

## Initial build sequence

Keep exactly two development lanes:

1. **Urgent Trust:** close the smallest hook, environment, authentication, and
   control-plane bypass slice with adversarial executed proof.
2. **Safe Operator value:** a local/read-only messy item from life or work
   reaches Today, a prepared action using a relevant generalist capability,
   durable waiting/resume, and restart/re-entry with no consequential external
   effect.

Attach evaluation, dogfood, and burden evidence to both lanes. Begin manual
market evidence immediately: functional executive-burden interviews, bounded
continuity-loop pilots across life and work, assisted/unassisted separation,
price tests, support time, incidents, and reasons for non-return. Unknowns remain
`unproven`.

The exact 28-outcome destination/acceptance catalog is:

```text
TRUST-01 TRUST-02 TRUST-03 TRUST-04 TRUST-05 TRUST-06
OP-01 OP-02 OP-03 OP-04 OP-05
UX-01 UX-02 UX-03 UX-04
LIFE-01 LIFE-02 LIFE-03 LIFE-04
GROW-01 GROW-02 GROW-03 GROW-04 GROW-05
PACK-01 LAB-01 EVAL-01 DOGFOOD-01
```

It is a dependency and acceptance map, not 28 simultaneous projects. Only
reconciled `roadmap.json` records consume current inventory.

Next: exact action/receipt binding, one WorkItem facade, trustworthy Needs You,
quarantined read-only morning orientation, and first-run/accessibility proof.
Consequential external effects wait for their trust dependencies.
