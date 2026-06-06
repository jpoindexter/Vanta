# EF Network Analysis — Real Patterns from Vanta Sessions

Sources: PMC4455841 (Rabinovici et al.), session handoffs 2026-06-02 through 2026-06-04,
today's conversation, Claude Code project transcripts.

This document maps OBSERVED EF failure patterns from real sessions to clinical EF components,
then specifies the Vanta counter-measure for each. Jason's sessions are the calibration dataset.

---

## Observed Patterns (from real data)

### Pattern 1: Research Spiral
**What it looks like**: Today — started with 5 concrete ship tasks (all completed). Then:
- "Check out MemPalace repo" → research
- "Check out AgentMemory repo" → more research
- "Brain dimensionality" → architectural research
- "Look through issues" → issue-triage research
- "Executive dysfunction paper" → clinical research
- "Scrape our conversations" → meta-research about the research

Each discovery generates more research items. No convergence gate fires. The stimulation of new ideas is reinforcing (reward) while execution of any single idea would terminate the stimulation loop.

**Clinical EF component**: Inhibition failure + Set Shifting difficulty
- Inhibition: unable to suppress the prepotent response to "this is interesting, follow it"
- Set Shifting: each new topic requires a full context switch before the prior one is complete
- Working Memory: the original 5-item plan is displaced by new working memory contents

**Vanta counter-measure needed**: 
- EF-INHIBIT (pre-action check: "does this serve the original goal?")
- EF-TASKBOUNDARY (explicit marker when shifting from build to research mode)
- **NEW**: Research convergence gate — after N research turns without an actionable output, surface "you've been researching for X turns, want to pick one item to build?"

---

### Pattern 2: Initiation Paralysis on Backlog
**What it looks like**: handoff-2026-06-04-1145: "next lane has 11 items — that's a captured backlog, not a plan. Pick ONE to build first." The handoff was explicit about the problem. Multiple sessions ended with "Blocked / Needs Decision" on what to build next.

From handoff: "Decide the ONE next build. Put one card in building — dogfood the WIP limit."

**Clinical EF component**: Planning deficit + Initiation failure
- Case 4-2 analog: "she felt paralyzed when faced with multifaceted problems"
- The 11-item backlog IS the multifaceted problem — too many options → paralysis
- MMSE analog: the backlog looks productive (lots of items!) but functional output = 0

**Vanta counter-measure needed**:
- ND1 /next (SHIPPED) — converts the 11-item paralysis into ONE micro-step ✓
- KANBAN WIP limit (SHIPPED) — prevents adding more cards while paralyzed ✓
- EF-COMPLEXITY-GATE (planned) — auto-prompt to plan before accumulating more items
- **NEW**: Choice reduction gate — when the backlog has >3 items in "next," present only the TOP 3, ranked by dependencies + last-modified. Hide the rest until one ships.

---

### Pattern 3: Day-restart Fragmentation
**What it looks like**: 2026-06-04 had 5+ sessions. Each started fresh (/clear or new session). Each session picked up a different thread. The continuity between sessions is preserved only by handoff docs and MOIM.

From handoff-2026-06-04-1145: "Stale context → suggest /clear and tight restart."
From CLAUDE.md: "Thread is working memory, not a workspace."

The sessions show: morning sprint → afternoon research → evening sprint → late-night meta-research. Each pivot starts a new "working memory instance." The context of the morning sprint is entirely lost by evening.

**Clinical EF component**: Working Memory failure under load
- Phone-number analog: holding the morning task while doing the afternoon task = impossible
- Set Shifting: moving from "build mode" to "research mode" fails to preserve the build thread
- The functional impairment is hidden: each session looks productive in isolation

**Vanta counter-measure needed**:
- MEM-VERBATIM (planned) — verbatim session archive so "what did morning-session do" is answerable
- EF-WORKINGMEM (planned) — active task stack that survives session boundaries
- /moim (SHIPPED) — preserves one top-of-mind note ✓
- **NEW**: Session continuity score — at session start, measure drift from yesterday's active goals. If drift > threshold, surface the last active task before accepting new tasks.

---

### Pattern 4: Ideas-Rich / Finish-Poor Bounce
**What it looks like**: This is documented explicitly in CLAUDE.md as "Jason over-engineers and doesn't ship." Also named in KANBAN item: "targets the documented ideas-rich/finish-poor pattern + this session's live 8-goal bounce."

From handoff-2026-06-04-1145: "Nothing from the research was built — it's a capture backlog by design." The capture-not-build session is valuable, but it creates debt: a roadmap with 100 items and no clear "build this now."

**Clinical EF component**: Fluency excess + Planning failure
- Fluency: the ability to generate ideas is INTACT — producing many options is easy
- Planning: the ability to SEQUENCE the options (identify, prioritize, properly sequence steps) is impaired
- The paradox: high verbal fluency masks planning deficits (same as Case 4-2: MMSE 28/30 but non-functional)

**Vanta counter-measure needed**:
- FAC-INTENT (SHIPPED) — factory gate that rejects output not addressing the work item ✓
- KANBAN WIP limit (SHIPPED) — hard limit on ideas-in-progress ✓
- **NEW**: Velocity tracker — ratio of (items captured) to (items shipped) over rolling 7 days. Surface as a note when ratio > 5:1: "You've captured 20 items and shipped 2 this week. Want to clear the queue before adding more?"

---

### Pattern 5: The "While We're At It" Scope Extension
**What it looks like**: Banned explicitly in CLAUDE.md: "While we're at it banned. Force scope additions explicit: park or commit?" This is a known, recurring pattern — not hypothetical.

During today's session: while implementing FAC-INTENT, I also checked MemPalace issues, added 8 roadmap items, wrote two design docs, and analyzed clinical neuroscience papers. The original goal (5 feature implementations) expanded to include significant research architecture.

**Clinical EF component**: Inhibition failure
- The prepotent response to "this is interesting/relevant" overrides the inhibition gate
- Utilization behavior analog: picking up and using every interesting object encountered
- Stimulus-bound: each new discovery triggers engagement regardless of current goal

**Vanta counter-measure needed**:
- EF-INHIBIT (planned) — soft pre-action goal check ✓
- **NEW**: Scope delta tracker — at the end of each turn, compute how many distinct topics were touched. If > 3 distinct topics in one turn, flag it. Not a block — a visible annotation.

---

### Pattern 6: Incomplete Thread Accumulation
**What it looks like**: The handoffs consistently have "In Progress (not finished)" sections. Items get 70% done and then a new session starts on something else. The FAC-INTENT item was started, then research was interleaved, now there's a new goal about "building a network."

From today: KANBAN-S3 → TUI-DIFF → TUI-MODE → ND5 → FAC-INTENT → MemPalace research → AgentMemory research → brain architecture → EF paper → NOW: conversation scraping + network building.

**Clinical EF component**: Set Shifting + Working Memory
- Set shifting: moved to a new cognitive set (research) without completing the prior set (documentation)
- Working memory: the "I need to document FAC-INTENT properly" intention was displaced
- Multitasking difficulty: each thread is "almost done" but none gets closure

**Vanta counter-measure needed**:
- MEM-SESSION-RECOVER (planned from AgentMemory #737) ✓
- EF-TASKBOUNDARY (planned) ✓
- **NEW**: Closure gate — before starting a new major thread, check for incomplete items from the current session that are >50% done. Surface: "You have 2 items in-progress this session. Finish one before starting a new thread?"

---

## The EF Network (Cause → Effect → Counter-measure)

```
┌─────────────────────────────────────────────────────────────────┐
│  ROOT CAUSES (EF components)                                    │
│                                                                 │
│  [Working Memory Overload]                                      │
│      │ displaces goals under cognitive load                     │
│      ├──→ Pattern 3 (Day-restart fragmentation)                 │
│      └──→ Pattern 6 (Incomplete thread accumulation)           │
│                                                                 │
│  [Inhibition Failure]                                          │
│      │ prepotent "interesting!" response not suppressed        │
│      ├──→ Pattern 1 (Research spiral)                          │
│      └──→ Pattern 5 (While-we're-at-it scope extension)        │
│                                                                 │
│  [Planning Deficit]                                            │
│      │ can't sequence many options → paralysis                  │
│      └──→ Pattern 2 (Initiation paralysis on backlog)          │
│                                                                 │
│  [Fluency Excess + Planning Deficit]                           │
│      │ generating ideas is easy, shipping is hard              │
│      └──→ Pattern 4 (Ideas-rich / finish-poor bounce)          │
│                                                                 │
│  [Set Shifting Failure]                                        │
│      │ context bleeds across cognitive sets                    │
│      ├──→ Pattern 1 (research contaminates build context)      │
│      └──→ Pattern 6 (prior thread bleeds into new thread)      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SHIPPED COUNTER-MEASURES (already in Vanta)                     │
│                                                                 │
│  Working Memory:  MOIM, /next, session persist, /where (planned)│
│  Inhibition:      anti-drift rules, CLAUDE.md "park or commit" │
│  Planning:        /planmode, /next, KANBAN WIP=2               │
│  Fluency excess:  KANBAN WIP limit, FAC-INTENT judge           │
│  Set Shifting:    /clear, ERRORS.md, task boundary (planned)   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  GAPS (needed but not in roadmap yet)                           │
│                                                                 │
│  Research convergence gate (Pattern 1)                         │
│  Choice reduction gate (Pattern 2)                             │
│  Session continuity score (Pattern 3)                          │
│  Velocity tracker — capture:ship ratio (Pattern 4)            │
│  Scope delta tracker per turn (Pattern 5)                      │
│  Closure gate before new threads (Pattern 6)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## What makes this unique vs generic productivity tools

Generic productivity tools (Notion, Linear, Todoist) address NONE of these patterns because:
1. They require the user to initiate the correction (EF failure IS the initiation failure)
2. They're passive (no real-time drift detection)
3. They don't understand the context (can't tell if a tool call is off-goal)
4. They don't adapt to cognitive load (same UX whether you've been working 1 hour or 8 hours)

Vanta as an EF prosthetic works because:
1. **It's in the loop** — every tool call, every turn, every session start is an opportunity to check
2. **It has context** — it knows the active goal, the tool call history, the session history
3. **It can intervene gently** — not blocking, but noting (inhibition support, not wall)
4. **It learns the patterns** — BRAIN-NEURO + MEM-COMPRESS will recognize recurring EF signatures

---

## New roadmap items from this analysis

1. **EF-RESEARCH-GATE**: Research convergence gate — after N research turns without actionable output, surface "you've been researching X turns, want to pick one to build?"
2. **EF-CHOICEREDUCE**: Backlog choice reduction — present only top 3 from the next queue, hide the rest until one ships.
3. **EF-VELOCITY**: Velocity tracker — capture:ship ratio over 7 days; warn when > 5:1.
4. **EF-SCOPEDELTA**: Scope delta tracker — flag when > 3 distinct topics touched in one turn.
5. **EF-CLOSUREGATE**: Closure gate — before starting new major thread, surface in-progress items from the current session.
