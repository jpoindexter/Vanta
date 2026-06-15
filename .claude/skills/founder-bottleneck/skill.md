---
name: founder-bottleneck
description: "Launch/Scale-stage skill: audits every workflow, decision, and approval currently routed through the founder, then categorizes each as automate / delegate / keep. Produces a bottleneck map and automation candidates list. Use when someone says: founder bottleneck, I'm the bottleneck, audit my workflows, what can I automate, operational audit, delegation map, build systems to replace me."
---

# Founder Bottleneck

Launch/Scale-stage operational audit. Maps everything currently routed through the founder's attention, identifies what's keeping them stuck in execution mode, and produces a prioritized list of what to automate, delegate, or keep.

## The Failure Mode This Prevents

At MVP, founder-centricity was an asset — tight feedback loops and full situational awareness were features, not bugs. At Launch, that same instinct becomes the constraint. The transition from doing the work to designing the systems that do the work is one of the hardest shifts in the startup lifecycle. Telltale signs: decisions that should take an hour now take a week, support requests pile up because only you know the answer, and operational tasks only happen when you personally remember to do them.

The goal is not to remove yourself from the company. The goal is to free your attention for the decisions only a founder can make.

## Phase 1 — Bottleneck Map

Catalog every recurring workflow, decision, and approval currently routed through you. Be exhaustive. The goal is to make the invisible visible.

**Format for each item:**
- Name: [short description]
- Frequency: [daily / weekly / monthly / per-event]
- Trigger: [what starts it]
- Your role: [do it / approve it / remember to do it / answer a question about it]
- Time: [rough estimate per occurrence]
- What breaks if you're unavailable for a week: [specific consequence]

**Categories to mine:**

**Customer operations:**
- Support requests that only you can answer
- Onboarding that requires your presence
- Escalations that land on you by default
- Customer success check-ins you're running manually

**Product operations:**
- Bug triage decisions
- Feature prioritization calls
- Spec approval before work starts
- "Is this the right thing to build?" questions from yourself

**Business operations:**
- Weekly metrics compilation
- CRM updates and pipeline management
- Invoicing and payments
- Vendor management and renewals
- Legal reviews and contract routing

**Communication:**
- Status updates to investors / advisors / board
- Team standups and syncs (if you have a team)
- Partner / prospect conversations that only you can have
- Content publication approvals

**Reporting:**
- Weekly KPI brief
- Monthly investor update
- Product changelog
- User-facing release notes

## Phase 2 — Categorization

For each item from Phase 1, assign one of three categories:

**AUTOMATE** — workflow can be fully automated with existing tools (Claude Cowork, Zapier, n8n, custom scripts). No human judgment required. The trigger, decision rules, and output are fully specifiable.

Criteria: Could you write a complete spec for this that covers every case? If yes, it's automatable.

Examples: CRM updates when deal status changes, weekly metrics brief from connected data sources, bug report routing by type, renewal tracking, documentation updates triggered by product changes.

**DELEGATE** — workflow requires human judgment, but not specifically yours. Could be handled by a future hire, contractor, or structured process that someone else executes.

Criteria: Could you write an SOP for this that a competent person could follow without asking you questions? If yes, it's delegatable.

Examples: Tier-1 support responses (with a playbook), outreach scheduling (with criteria), investor update compilation (with template), content drafts (with brand guidelines).

**KEEP** — genuinely requires the founder's judgment, relationships, or context. Cannot be systematized without losing something important.

Criteria: Does this require institutional knowledge that only you have, relationships only you hold, or judgment calls that depend on strategic context you can't document?

Examples: Founder-to-founder conversations, strategic narrative decisions, enterprise deal closing, board relationships, product vision calls, hiring decisions.

## Phase 3 — Automation Design

For every AUTOMATE item, design the workflow logic before touching any tooling:

- **Trigger:** What starts this workflow?
- **Decision rules:** What conditions govern the path it takes?
- **Output:** What does it produce, in what format, delivered where?
- **Exception path:** What triggers a human-in-the-loop escalation?
- **Validation:** How do you know the automation ran correctly?

Group automation candidates into two tiers:

**Tier 1 — High-frequency, low-complexity:** Daily or weekly tasks with clear trigger-rule-output structure. Build these first. They free up the most attention for the least effort.

**Tier 2 — High-value, higher-complexity:** Less frequent but high-stakes workflows where automation has outsized leverage. Build these after Tier 1 is running reliably.

## Phase 4 — Delegation Design

For every DELEGATE item, design the handoff:

- **SOP:** Written step-by-step procedure. Test it by following it yourself once — if you have to go off-script, it's not done.
- **Decision criteria:** Documented rules for the most common judgment calls.
- **Escalation path:** When and how to escalate to the founder (be specific — not "when in doubt" but "when [specific condition]").
- **Quality check:** How will you know it's being done correctly?

## Phase 5 — Founder-Only List

Having categorized everything else, produce the explicit list of what genuinely belongs on your plate. This is as important as the automation list — it's the job description for what a founder does at Launch/Scale stage.

Typical founder-only items at this stage:
- Strategic product direction decisions
- Enterprise deal negotiation and relationship
- Investor and board relationships
- Hiring the first non-founder employees
- Narrative and brand voice decisions
- Any decision where the context required to make it correctly can't be written down

If your founder-only list has more than 10–15 items, you've been too generous. Push back on each one: could someone with the right context and criteria make this call instead of you?

## Output Format

```
## Founder Bottleneck Audit

**Audit Date:** [Date]
**Stage:** [Launch / Scale]

---

### Bottleneck Map

| Workflow | Frequency | Your Role | Time/Week | Breaks If Gone |
|----------|-----------|-----------|-----------|----------------|
| [item] | [freq] | [role] | [time] | [consequence] |

**Total founder time in execution mode per week:** [hours]

---

### Categorization

#### AUTOMATE (can be fully systematized)
| Workflow | Tier | Automation Approach |
|----------|------|---------------------|
| | | |

#### DELEGATE (human judgment, not specifically yours)
| Workflow | SOP Status | Who/What |
|----------|-----------|----------|
| | | |

#### KEEP (genuinely founder-only)
| Workflow | Why It Stays |
|----------|-------------|
| | |

---

### Automation Queue — Tier 1 (build first)

**[Workflow name]**
- Trigger: [what starts it]
- Decision rules: [conditions and paths]
- Output: [what it produces + where it goes]
- Exception path: [when to escalate]
- Tool: [Claude Cowork / Zapier / custom / other]

[Repeat for each Tier 1 item]

---

### Automation Queue — Tier 2 (after Tier 1 is stable)

[Same format]

---

### Delegation Queue

**[Workflow name]**
- SOP: [link or inline]
- Escalation trigger: [specific condition]
- Quality check: [how you verify]

---

### Founder-Only List

[Explicit list — the job description for what stays on your plate]

---

### Attention Recovery Estimate

After completing Tier 1 automations + first delegation handoffs:
**Hours/week recovered:** [estimate]
**What that attention goes to:** [specific founder-only items it unlocks]
```

## Rules

- Be ruthless. "Only I know how to do this" is usually a documentation problem, not a genuine founder-only constraint.
- Don't automate before designing. A bad automation that runs reliably is worse than doing the thing manually.
- The "what breaks if you're gone for a week" question is the most important one. If the answer is "nothing breaks" — why are you doing it? If the answer is "everything breaks" — that's the highest priority automation candidate.
- Tier 1 automations should be live before building any new product features. Operational debt compounds the same way technical debt does.
