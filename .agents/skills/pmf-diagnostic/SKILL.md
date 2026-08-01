---
name: pmf-diagnostic
description: "MVP-stage skill: diagnoses whether genuine product-market fit exists or if traction is a false positive. Runs Sean Ellis test, effort test, and iteration analysis. Returns a verdict: stay / adjust / pivot / back-to-idea. Use when someone says: do we have PMF, is this real traction, should I pivot, product-market fit check, analyze retention, what do my numbers mean."
---

# PMF Diagnostic

MVP-stage product-market fit diagnosis. Takes your real numbers and user feedback and returns an honest verdict on whether you have genuine PMF or a false positive — plus a specific recommended action.

## The Failure Mode This Prevents

Early momentum is the most psychologically powerful experience a founder can have. Agentic coding tools let you reach it faster than ever before, but early traction is not the same as product-market fit. Launch energy is generated from ephemeral sources: founder's friends, prospective buyers at your investor's portfolio companies, a Hacker News headline. None of these predict week six or week twelve when that initial boost has faded.

The diagnostic exists to distinguish real signal from flattering noise before you over-invest in the wrong answer.

## Inputs Required

Before running the diagnostic, collect:

1. **Retention data:** What % of users who signed up in week 1 are still active at Day 7? Day 30?
2. **Revenue data (if applicable):** Paying users, churn rate, expansion MRR
3. **Engagement data:** Frequency of use, depth of engagement (how many features/workflows per session)
4. **Acquisition data:** Where did users come from? (organic/referral vs. pushed/paid/launch-event)
5. **User feedback:** Verbatim quotes from 5+ users (support tickets, interviews, messages)
6. **Churn data:** Why did users who left stop using the product? What did they say?
7. **Original hypothesis:** The problem-solution hypothesis from the Idea stage

## Test 1 — Sean Ellis Test

The Sean Ellis test is the single most reliable early PMF indicator. It requires at least 30 active users to be statistically meaningful.

**The question to ask active users (exact wording matters):**
> "How would you feel if you could no longer use [product]?"
> A) Very disappointed
> B) Somewhat disappointed
> C) Not disappointed
> D) N/A — I no longer use it

**Benchmark:** If 40%+ answer "Very disappointed," that's a meaningful PMF indicator. Below 40% is not PMF — it's a product people like but don't need.

**What to do with the results:**
- 40%+ Very disappointed → strong PMF signal. Move to Launch stage planning.
- 25–39% Very disappointed → real users who care. Find out what's different about them vs. the rest. Segment.
- Below 25% → not PMF. Don't interpret this charitably. Move to the effort test.

**Segmentation question (ask if you have enough volume):**
Among the "very disappointed" group: what do they have in common that the "somewhat disappointed" group doesn't? This segment is your real ICP, and the product may already have PMF for a narrower audience than you thought.

## Test 2 — Effort Test

The effort test doesn't require a survey. It reads behavior.

**Pre-PMF pattern:** Retention requires constant intervention. You're sending re-engagement emails, manually onboarding every user, personally following up with churned users, offering incentives to stay active. The product pulls only when you push.

**Post-PMF pattern:** Users return without prompting. They refer others without being asked. They complain when the product is down. They use it more than you expected or in ways you didn't design for.

**Run this audit on your current engagement data:**

| Behavior | Pre-PMF | Post-PMF | Yours |
|----------|---------|----------|-------|
| Re-engagement | Requires founder outreach | Users come back on their own | |
| Referrals | You ask for them | Users send them unprompted | |
| Feature requests | Vague / nice-to-have | Specific / urgent | |
| Churn reason | Boredom / no value | Specific gap in functionality | |
| Bug reports | Users go quiet | Users complain loudly | |
| Session depth | Surface-level | Deep engagement with core feature | |

Fill in your data. Where does your product sit?

## Test 3 — Iteration Cycle Analysis

If you've done 3+ MVP iteration cycles without meaningful movement toward your PMF benchmarks, something structural is wrong.

**Run this diagnostic:**

Feed into the analysis:
- Your original problem hypothesis
- Your retention data across 3+ iteration cycles (each cycle = one sprint of changes + measurement)
- Verbatim user feedback from each cycle
- What you changed each cycle and why

**Three diagnostic questions:**
1. Is there a segment in this data responding differently than the rest? (If yes: narrow to that segment immediately)
2. Is the gap between designed value and experienced value a positioning problem or a product problem? (If positioning: messaging change. If product: the core interaction needs rethinking.)
3. What would have to be true for the current product to find genuine PMF — and is that scenario realistic given what you're seeing?

## Verdict Framework

Based on the three tests, return one of four verdicts:

**STAY — evidence confirms PMF, move to Launch stage**
Criteria: 40%+ Sean Ellis, pull-not-push effort pattern, and the iteration data shows consistent improvement.
Next action: Architectural audit + Launch stage planning.

**ADJUST — real signal from a subset, narrow the ICP**
Criteria: 25–39% Sean Ellis, or clear segment difference in the data, or users who match a specific sub-profile have very different retention than the average.
Next action: Rewrite the ICP to match who's actually getting value. Stop trying to make the current product work for everyone. Rebuild onboarding and messaging for the narrowed segment. Re-measure in 2 cycles.

**PIVOT — current product direction isn't working, reframe the solution**
Criteria: Below 25% Sean Ellis, push-not-pull pattern, multiple iteration cycles without movement.
Next action: Don't rebuild the product. Use the user feedback data to identify what users actually wanted instead of what you built. Run this diagnostic:
- What's the most common thing users said they wanted that isn't in the product?
- What's the one thing churned users mentioned most?
- Is there a related problem in the data that you didn't set out to solve, but users keep mentioning?

This data points toward the pivot. The pivot shouldn't be random — it should be evidence-directed.

**BACK-TO-IDEA — problem hypothesis was wrong, restart validation**
Criteria: Users don't use the product even when you push, low Sean Ellis, churn data is "not the right solution for my problem" or "solved a problem I don't actually have," and the product has been through 4+ iteration cycles.
Next action: Return to the Idea stage with the user data you've collected. The interviews, the churn feedback, the usage patterns — this is the richest validation data you have. Use it to find the real problem before building anything new.

## Output Format

```
## PMF Diagnostic

**Product:** [Name]
**Assessment Date:** [Date]
**Data Period:** [Start] → [End]

---

### Test 1 — Sean Ellis Test

**Sample size:** [N users]
**Results:**
- Very disappointed: [%]
- Somewhat disappointed: [%]
- Not disappointed: [%]

**Benchmark:** 40% threshold
**Result:** [ABOVE / BELOW / INSUFFICIENT SAMPLE]

**Segmentation finding:** [What's different about the "very disappointed" group, if anything]

---

### Test 2 — Effort Test

| Behavior | Pre-PMF | Post-PMF | Assessment |
|----------|---------|----------|------------|
| Re-engagement | Requires founder outreach | Users return on their own | [yours] |
| Referrals | You ask | Unprompted | [yours] |
| Feature requests | Vague | Specific/urgent | [yours] |
| Churn reason | Boredom | Specific gap | [yours] |

**Pattern:** [Pull / Push / Mixed]

---

### Test 3 — Iteration Cycle Analysis

**Cycles completed:** [N]
**Movement toward PMF benchmarks:** [Yes / No / Partial]

**Diagnostic answers:**
1. Segment responding differently? [Yes/No + detail]
2. Positioning or product problem? [Positioning / Product + reasoning]
3. What would have to be true? [Is it realistic?]

---

### Verdict

**[STAY / ADJUST / PIVOT / BACK-TO-IDEA]**

**Reasoning:** [2–3 sentences connecting the test results to the verdict]

**Next action:** [Specific, concrete, first step]

**Evidence used:** [List the data points that drove the verdict]

**Evidence ignored:** [Data points that were tempting to cite but don't actually support the verdict — naming these prevents cherry-picking]
```

## Rules

- Do not soften the verdict. A "pivot" is not a failure — it's the system working. A founder who stays too long on the wrong path because the feedback was gentle is the failure.
- Never call it PMF without the Sean Ellis data. "Users seem to like it" is not a diagnostic.
- The "Evidence ignored" section is mandatory. If you only cite evidence that supports the verdict, you haven't done a diagnostic — you've done a post-hoc rationalization.
- If sample size is below 30 for Sean Ellis, note this prominently and treat the result as directional, not conclusive.
