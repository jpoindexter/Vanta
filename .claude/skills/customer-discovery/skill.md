---
name: customer-discovery
description: "Idea-stage skill: designs a complete customer discovery system — target profile, interview framework, question set, post-interview synthesis. Use when someone says: customer discovery, user interviews, who should I talk to, design interview questions, synthesize interview notes, build outreach list."
---

# Customer Discovery

Idea-stage customer discovery system. Designs the full operation: who to talk to, how to find them, what to ask, and how to make sense of what you hear. The goal is qualitative evidence that either confirms or breaks the hypothesis — not a search for confirmation.

## The Failure Mode This Prevents

Most founders ask bad questions that produce bad signal. "Would you use something like this?" produces socially desirable answers. "Tell me about the last time you dealt with this problem" produces actual behavior data. One is research; the other is optimism theater.

## Phase 1 — Target Profile

Build a precise target profile from the validated hypothesis. Precision beats quantity: 10 interviews with exactly the right person beats 50 with the wrong one.

**Define the primary profile:**
- Job title (exact, not broad category)
- Company type (industry, business model, stage)
- Company size (headcount or revenue band)
- Team structure (who they report to, who reports to them)
- Seniority level
- Key identifier: how do you know this person experiences the problem acutely?

**Define where they're reachable:**
- LinkedIn search strings (title + company filters)
- Communities (Slack workspaces, Discord, subreddits, LinkedIn groups, newsletters)
- Events (conferences, webinars, meetups)
- Warm paths (investors, advisors, founders who share customer bases)
- Cold outreach viability (response rate expectations by channel)

**If the hypothesis has 2+ personas** (e.g. buyer vs. user, or manager vs. IC), define a separate profile for each. They have different relationships to the problem, and a single question set will flatten that distinction.

**Output:** A prioritization matrix — profiles ranked by (a) closeness to the problem and (b) reachability, with top 5 target prospects identified by name or search string.

## Phase 2 — Interview Framework

Design the interview protocol. The goal is to surface what people actually do, not what they think they'd do.

**Structural rules:**
- Open with context-setting, not problem-framing. Let them describe the landscape before you name the problem.
- Anchor to the past ("tell me about the last time...") not the future ("would you...").
- Ask about behavior ("what did you do?") not attitude ("how do you feel about?").
- One question at a time. Don't stack.
- Every question should be answerable with a specific story or example. If it can be answered abstractly, rewrite it.

**Interview structure (45–60 min):**

**Opening (5 min):** Establish context without signaling the hypothesis.
- "Can you walk me through your role and what your day-to-day looks like in [area]?"
- "What are the biggest recurring challenges in that area?"

**Problem exploration (20 min):** Find the actual problem, not the assumed one.
- "Tell me about the last time you ran into a problem with [broad area]. Walk me through exactly what happened."
- "How often does that happen?"
- "What did you do about it? Walk me step-by-step through what that looks like."
- "What tools or processes are you using for this?"
- "What's the biggest frustration with how you currently handle it?"
- "How much time does this take? Is that time you can absorb, or does it cause downstream problems?"

**Priority check (10 min):** Find where this actually ranks.
- "If you could fix three things about [area] this quarter, what would they be?"
- "Where does this problem rank relative to those?"
- "Is there budget allocated to solving this, or is it a 'nice to have'?"

**Solution probing (10 min):** Only if they've confirmed the problem is real.
- "Have you looked at solutions for this? What did you find?"
- "What would a solution need to do for you to actually use it?"
- "What would make you not trust a solution in this space?"

**Closing (5 min):**
- "Is there anyone else dealing with this problem that I should talk to?"
- "Can I follow up with you as I learn more?"

**Flag these questions as leading / low-signal and rewrite if they appear:**
- "Would you use a product that...?"
- "Do you think there's a market for...?"
- "Would you pay for...?"
- "Don't you think it would be better if...?"

## Phase 3 — Post-Interview Synthesis

After every interview, debrief immediately using this structure:

**Single-interview debrief (5 min, do right after):**
1. One thing that confirmed the hypothesis
2. One thing that challenged it
3. One thing that was genuinely surprising
4. Strongest quote (exact words, not paraphrase)

**Batch synthesis (every 5 interviews):**

Feed all notes into Claude and ask for two lists:
1. Evidence that supports the hypothesis (with source interview)
2. Evidence that challenges or contradicts it (with source interview)

Then ask: "If the second list is significantly longer or more specific than the first, what does that tell us about the hypothesis?"

**Pattern extraction:**
- Recurring language: what exact words do multiple people use to describe the problem? These are your future marketing copy.
- Behavioral patterns: what workarounds do most people share? That's your competitive landscape.
- Outliers: who described the problem differently? Are they a different persona, or are they right and the others are wrong?
- Signal vs. noise: which data points came from people who match the target profile vs. people who were convenient to talk to?

**Confirmation bias check (mandatory):**
Before reading the synthesis, state what you expected to find. After reading, identify which findings surprised you. Findings that surprised you are the most valuable. Findings that confirmed what you expected need the most scrutiny.

## Phase 4 — Customer Outreach Automation

**Prospect list build:**
Using the target profile, build a structured list:
- Name, title, company, source (how found), connection path (warm/cold/community)
- Priority tier (1 = matches profile exactly, 2 = close match, 3 = adjacent)

**Outreach sequence:**
- Day 1: Initial outreach (personalized, 3 sentences max, asks for 20-min conversation not a demo)
- Day 7: One follow-up if no response ("still interested in your perspective on X")
- Day 14: Final follow-up or move to next prospect

**Message template (customize per person):**
> "Hi [Name] — I'm researching [specific problem area] in [their context]. I noticed you're in [role] at [company type] which means you probably deal with [specific aspect of problem]. I'm doing 20-minute conversations to understand how people in your role handle this — no pitch, just learning. Would you be open to a quick call this week?"

**Tracking:**
Maintain a simple spreadsheet: Name | Company | Status (outreach sent / responded / scheduled / completed) | Notes | Priority

## Exit Criteria

Customer discovery is complete when:
- 10+ interviews completed with people who match the target profile
- The batch synthesis produces consistent patterns (not just noise)
- You can answer all three readiness questions from `problem-hypothesis` with evidence from real conversations, not assumptions

**Green signal:** Multiple people described the problem unprompted using similar language, and at least one showed genuine urgency (has budget, is actively looking for solutions, would act now).

**Red signal:** People are polite about the problem but vague about urgency. Nobody is currently solving it actively. Nobody mentioned it unprompted.

## Output Format

```
## Target Profile

### Primary Persona
[Title, company type, size, team structure, key identifier]

### Where to Find Them
[LinkedIn strings, communities, events, warm paths]

### Priority Prospect List
| Name | Company | Source | Priority | Status |
|------|---------|--------|----------|--------|

## Interview Framework

[Full question list organized by phase]

## Synthesis Template

### Supporting Evidence
[Evidence list with source]

### Challenging Evidence
[Evidence list with source]

### Patterns Found
- Language patterns:
- Behavioral patterns:
- Outliers:

### Confirmation Bias Check
[What I expected vs. what surprised me]

## Readiness Assessment

[READY FOR MVP / NOT READY — what's missing]
```
