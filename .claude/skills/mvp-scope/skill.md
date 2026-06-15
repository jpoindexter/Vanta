---
name: mvp-scope
description: "MVP-stage skill: creates a locked scope document defining exactly what the MVP does, what it deliberately does not do, and the specific user-evidence threshold for adding anything new. Use when someone says: define MVP scope, what should I build, scope document, mvp definition, what's in scope, prevent scope creep, define done."
---

# MVP Scope

MVP-stage scope definition. Creates a written contract between you and future-you that prevents scope creep when agentic coding makes it feel free to add one more thing.

## The Failure Mode This Prevents

Zero-friction scope creep is the defining failure mode of AI-era MVPs. When adding a feature takes an afternoon instead of a sprint, every new idea feels defensible. The product sprawls beyond its original boundaries before you consciously decide to change direction. You end up with a codebase that has no coherent mental model behind it — not because any single piece is bad, but because the pieces were never designed to fit together.

The antidote is a written scope definition that moves the decision point from "should we build this?" to "has a critical mass of users told us they can't get value without this?"

## Phase 1 — Define the Core Interaction

Before scoping anything else, identify the single core interaction the MVP depends on.

**The core interaction is:** the minimum surface area a user needs to touch to get the primary value the product promises.

Ask and answer:
- What is the one thing a user does in this product that couldn't be done before?
- What is the minimum UI/flow needed to do that one thing?
- If you removed everything else, would the core promise still be deliverable?

**Output:** One sentence. "The MVP lets [specific user] [do specific thing] that [achieves specific outcome]."

Examples:
- "The MVP lets finance managers at mid-market SaaS companies reconcile expense submissions without leaving their accounting software."
- "The MVP lets solo founders track customer discovery interviews and surface recurring objections across sessions."

If you can't write that sentence without conjunctions ("and also"), you have two MVPs. Pick one.

## Phase 2 — Scope Document

Create the full scope document with four mandatory sections.

### Section 1: What This MVP Does

List every feature or workflow that is IN scope. For each:
- What does it do (behavior, not implementation)
- Who uses it (which persona)
- What's the minimum version that's good enough to ship (not perfect, not full-featured)

Be specific. "User authentication" is not a feature — "email/password login with email verification" is.

### Section 2: What This MVP Deliberately Does Not Do

The explicit exclusion list is as important as the inclusion list. For each item:
- Name the thing (feature, workflow, user type, platform)
- State why it's excluded (wrong stage, needs user evidence first, premature optimization, different persona)
- State what evidence would justify adding it (user signal threshold)

Common exclusion categories:
- Mobile app (web-only until desktop PMF is confirmed)
- Admin dashboard / analytics (for the founder, not the user — post-launch)
- Multi-user / team features (solve for single user first)
- API / integrations (direct workflows before automated ones)
- Settings / preferences / themes (defaults are fine until users complain)
- Onboarding flows (manual onboarding first)
- Notifications / emails / reminders (only once there's something worth notifying about)

### Section 3: Feature Amendment Criteria

A single written rule that governs when new scope can be added:

> "A feature may be added to MVP scope only when [N] users have independently said they cannot get value from the product without it AND [supporting evidence condition]."

Set N between 3–5 for early MVP. The key word is "independently" — one user saying it loudly is founder-confirmation-bias bait.

Supporting evidence conditions (pick the most appropriate):
- "AND at least one has churned citing it as the reason"
- "AND it blocks them from completing the core interaction"
- "AND it has surfaced in post-interview synthesis as a recurring pattern"

### Section 4: Architecture Constraints

Document the architectural decisions that should constrain what gets built. These prevent Claude Code from re-deriving foundational decisions from scratch each session.

- Tech stack (locked)
- Data model constraints (what you won't change without explicit decision)
- Dependencies to avoid (and why)
- Patterns to follow (and what replaces them if they don't fit)
- Scale assumptions (who you're building for now, not who you might build for later)

## Phase 3 — Session Template

Create a minimal session template for every Claude Code session during the MVP stage. Starting each session without this is how architectural drift accumulates.

```markdown
## Session: [Date] — [Goal]

**Context:** [Link to scope document] + [Link to CLAUDE.md]

**Task this session:** [One specific thing]

**Constraints from scope:**
- In scope: [relevant inclusions]
- Out of scope: [exclusions that might tempt scope creep today]
- Architectural patterns to follow: [relevant constraints]

**Definition of done for this session:** [Specific, testable]
```

End each session by adding a log entry to the scope document:
- What was built
- What decisions were made (and why)
- What assumptions changed
- Whether anything needs to be added to CLAUDE.md

## Scope Creep Pressure-Test

When a new feature idea surfaces during build, run this test before touching it:

1. **User signal?** Has a real user (not the founder, not an investor) said they cannot get value without this?
2. **Core interaction?** Does this directly serve the core interaction defined in Phase 1, or is it adjacent?
3. **Amendment criteria?** Does it meet the threshold in Section 3?

If any answer is no → park it. Don't debate it in-session. Add it to PARKED.md and move on.

If all three are yes → add it to scope with evidence cited, update CLAUDE.md, continue.

## Output Format

```
## MVP Scope Document

**Product:** [Name]
**Date:** [Date]
**Version:** 1.0

---

### Core Interaction

[One-sentence core interaction statement]

---

### In Scope

| Feature | Behavior | Persona | Minimum Viable Version |
|---------|----------|---------|----------------------|
| | | | |

---

### Out of Scope (Deliberately)

| Excluded | Why | Evidence Required to Add |
|----------|-----|--------------------------|
| | | |

---

### Feature Amendment Criteria

> A feature may be added to MVP scope only when [N] users have independently said they cannot get value from the product without it AND [condition].

---

### Architecture Constraints

- **Stack:** [locked choices]
- **Data model:** [constraints]
- **Avoid:** [dependencies/patterns to avoid + why]
- **Scale assumption:** [who you're building for now]

---

### Session Log

| Date | Built | Decisions | Scope Changes |
|------|-------|-----------|---------------|
| | | | |
```

## Rules

- The scope document is created BEFORE Claude Code writes the first line of production code.
- "While we're at it" is not a valid amendment reason. Ever.
- If it takes more than 30 seconds to decide whether something is in or out of scope, it's out of scope until user evidence says otherwise.
- The scope document overrides founder enthusiasm. That's the whole point.
