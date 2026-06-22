---
name: spaced-repetition
description: "Design any review/retention schedule to beat the forgetting curve: expanding intervals + active recall, distributed not massed. Load before building a study plan, an onboarding drip, a doc/skill re-review cadence, or a flashcard/retention feature."
created: 2026-06-22
updated: 2026-06-22
tags: [learning, memory, retention, scheduling, spacing, review, ebbinghaus, leitner]
---

# Spaced Repetition

Whenever the goal is for something to be **remembered later** — by a person or by an agent — schedule the exposures, don't pile them up. Same total time, distributed differently, produces a completely different retention outcome. This is the single most replicated finding in learning science (Ebbinghaus 1885; the spacing effect has held across 250+ studies, every age and subject).

## The two facts to design around

- **Forgetting curve** — unrevisited information decays fast: roughly two-thirds gone within 24h, near-zero within a week. The brain discards what it doesn't revisit.
- **Spacing effect** — exposures spread across days retain *dramatically* more than the same hours in one block. The gap between exposures is when consolidation happens.

## The rule

1. **Distribute, never mass.** Three 20-min sessions across three days beat one 60-min block. If you only have one block, you've already lost most of it.
2. **Active recall, not re-reading.** Retrieving the answer (then checking) strengthens memory; re-reading feels productive and isn't. Test, don't review.
3. **Expanding intervals.** Re-surface each item just before it would be forgotten, then push the next interval out. A practical schedule: **1 day → 3 days → 7 days → 16 days → 35 days**. (Ebbinghaus tested 20min/1h/9h/1d/6d/31d.)
4. **Leitner adjustment.** On a correct recall, promote the item to the next-longer interval. On a miss, reset it to the shortest. Hard items get seen often; easy items fade to the background — effort goes where it's needed.

## Apply it to

- **A study/learning plan** — convert "study X for N hours" into N/3 sessions over ≥3 days with self-quizzing.
- **Onboarding / docs** — drip the material on an expanding schedule instead of one firehose; re-surface key concepts on day 1, 3, 7.
- **A retention feature** — model it on Leitner (1972) / Anki (2006): an item carries a box/interval and a `nextReview` timestamp; success promotes, failure demotes; only due items surface.
- **An agent's own memory** — reinforce on retrieval, decay the unretrieved, and *proactively* resurface high-value items before they decay (not only when something happens to recall them).

## The anti-pattern (name it when you see it)

Cramming — one concentrated block right before it's needed, then nothing. It's what most schedules default to (semester → finals week → forget) because it's easy to *plan*, not because it works. If a design reviews everything once, right before the deadline, it's optimized for forgetting.
