---
name: problem-hypothesis
description: "Idea-stage skill: sharpens a vague problem statement into a testable hypothesis, then runs adversarial pressure-testing and surfaces disconfirming evidence. Use when someone says: validate my idea, pressure-test this, is this problem real, help me find problem-solution fit, devil's advocate, sharpen my hypothesis."
---

# Problem Hypothesis

Idea-stage validation. Takes a vague problem observation and hammers it into a falsifiable hypothesis, then attacks it from every angle before a single line of code gets written.

## The Failure Mode This Prevents

Agentic coding makes it trivially easy to build before you've validated. 42% of startups failed because they built something nobody wanted — AI makes that rate go up, not down, because the prototype now appears in hours and gets mistaken for validation. A working demo is not evidence. These are the real evidence.

## Phase 1 — Sharpen the Hypothesis

Take the user's problem statement and force it to answer four questions. Keep pushing until all four have specific, falsifiable answers.

**1. Who exactly has this problem?**
Not "finance teams" — "finance managers at mid-market SaaS companies (50–500 employees) who handle monthly close without a dedicated FP&A hire." Job title, company type, company size, team structure, seniority. If you can't name a specific person, the hypothesis isn't ready.

**2. How often and how severely?**
Frequency (daily, weekly, per quarter) + severity (minor annoyance vs. blocks them from going home). If it's weekly and annoying, that's different from daily and career-threatening.

**3. What do they currently do about it?**
Specific workarounds: manual processes, cobbled-together tools, hiring someone, just not doing it. The workaround IS the competitive landscape. If there's no workaround, the problem may not be real.

**4. What would a solution actually need to do?**
Not features — the minimum outcome the user needs. "I need to know X before Y happens" or "I need to produce Z in under W minutes." This is what you're solving for.

**Output:** A rewritten problem statement in this form:
> "[Specific person] at [specific company type] spends [time/frequency] [doing X] because [current tools/process] doesn't [capability]. This costs them [concrete consequence]. They currently [workaround], which [why it's inadequate]."

If the output has any vague terms (teams, companies, often, sometimes, many) — it's not ready. Rewrite.

## Phase 2 — Adversarial Pressure-Test

Run each attack. For each one, state what the strongest version of the counterargument is — not the easiest to dismiss.

**Attack 1: The Frequency Tax**
If this problem only happens monthly or quarterly, the user won't pay for a recurring subscription. What's the minimum frequency that justifies the price point you're imagining? Does your hypothesis meet that bar?

**Attack 2: The Workaround Trap**
The current workaround is good enough. It's slow, but it works, and people know how to do it. Why would someone pay to replace a known pain with an unknown product? What specifically about the current workaround fails badly enough that they'd switch?

**Attack 3: The Competitor Argument**
Make the strongest possible case for why an existing solution already solves this. Not the version of the argument the founder would make ("oh, but they don't have X feature") — the version the competitor's best salesperson would make. Where does that argument land?

**Attack 4: The Market Timing Check**
Is this problem getting better or worse on its own? If the underlying trend (regulation, tooling, workforce change) means the problem dissolves in 2–3 years, the window is closing. If the trend makes it worse, there's tailwind. Which is it?

**Attack 5: The Urgency Test**
Would a buyer prioritize this problem this quarter? Not "would they want a solution" — would they actually approve spend and implementation time right now? List the 3 things ahead of this on their priority list. Is your problem in the top 3?

**Attack 6: The Confirmation Bias Audit**
What research has the founder done that supports the hypothesis? For each supporting piece, ask: did you find this by looking for it, or did you find it by looking for disconfirming evidence and failing? Evidence you went looking for is weak. Evidence that surprised you is strong. Classify each piece.

## Phase 3 — Readiness Verdict

Score the hypothesis on three dimensions:

| Dimension | Question | Pass |
|-----------|----------|------|
| Specificity | Can you name a real person who has this problem? | Yes = pass |
| Evidence | Do you have 3+ pieces of unsolicited evidence (not found by searching for it)? | Yes = pass |
| Urgency | Would a buyer prioritize this quarter without you pushing them? | Yes = pass |

**Pass all 3 → ready for customer discovery.**
**Fail 1 → state which, revise hypothesis, rerun.**
**Fail 2+ → not ready. Stop. Don't build anything. Talk to 10 people first.**

## Output Format

```
## Sharpened Hypothesis

[Rewritten problem statement in the specific form above]

## Adversarial Findings

### Attack 1 — Frequency Tax
[Strongest version of the attack + how the hypothesis responds]

### Attack 2 — Workaround Trap
[...]

### Attack 3 — Competitor Argument
[...]

### Attack 4 — Market Timing Check
[...]

### Attack 5 — Urgency Test
[...]

### Attack 6 — Confirmation Bias Audit
[Evidence inventory: strong (unsolicited) vs. weak (sought out)]

## Readiness Verdict

| Dimension | Score | Notes |
|-----------|-------|-------|
| Specificity | PASS / FAIL | |
| Evidence | PASS / FAIL | |
| Urgency | PASS / FAIL | |

**Verdict: READY FOR CUSTOMER DISCOVERY / NOT READY — [what to do next]**
```

## Rules

- Never soften an attack. The founder will face these from investors and customers; they should face them here first.
- If the hypothesis fails specificity, do not proceed to the attacks — fix that first.
- Do not generate supporting evidence. Only analyze evidence the founder already has.
- "I believe" and "I think" are not evidence. Name the source and how you found it.
