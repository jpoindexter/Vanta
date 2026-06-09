# Executive Dysfunction → Vanta Brain Design

Source: Rabinovici GD, Stephens ML, Possin KL. "Executive Dysfunction."  
Continuum (Minneap Minn). 2015 Jun;21(3 Behavioral Neurology and Neuropsychiatry):646–659.  
PMC4455841 — UCSF Memory and Aging Center. Full text + clinical cases read 2026-06-04.

---

## What the full article adds (missed on first pass)

### Two-network brain architecture (CRITICAL)
The article explicitly distinguishes two intrinsic connectivity networks:

**Executive Control Network** (what EF science usually covers):
- Prefrontal cortex (dorsolateral, ventrolateral), parietal cortex, basal ganglia, thalamus, cerebellum
- Functions: working memory, set shifting, inhibition, planning, fluency

**Salience Network** (separate, often forgotten):
- Frontal insula + anterior cingulate + ventromedial PFC + limbic/subcortical connections
- Functions: "decision making related to social and emotional as well as autonomic and interoceptive processing — monitoring the internal state as reflected by heart and respiratory rates or homeostatic needs such as hunger and thirst"
- Specifically targeted EARLY in frontotemporal dementia
- Determines WHAT MATTERS — which inputs deserve attention

**For Vanta's brain**: These must be two separate systems. The salience network decides what deserves attention; the executive control network determines how to act on it. Conflating them causes: trying to plan while not knowing what matters, or tracking what matters without being able to act.

### Two modes of working memory (from neuroanatomy section)
- **Maintenance mode** (ventrolateral PFC): hold information without transformation — "don't lose this"
- **Manipulation mode** (dorsolateral PFC): actively transform, update, or reason about held information — "compute with this"

Current Vanta MOIM is maintenance only. The gap: when given complex information that requires active reasoning (not just holding), there's no manipulation mode.

### Anterior cingulate = real-time error detection
The anterior cingulate cortex "plays a critical role in error detection." This is different from post-hoc review — it fires DURING execution when an error is being made. Vanta's background review (reviewAfterTurn) is a post-hoc reviewer, not a real-time error detector.

### Pre-supplementary motor area = response selection gate
"Engaged during response selection" — the moment between deciding what to do and doing it. In Vanta terms: the gap between "tool chosen" and "tool executed." This is where inhibition and self-monitoring interact.

### Orbitofrontal cortex = reward/punishment updating
"Particularly critical for assessing shifting reward-punishment contingencies." In Vanta terms: updating the agent's model of which approaches are working vs failing in the current context. Not just memory of past failures — active updating of the reward landscape.

### Clinical case insights (from full case readings)

**Case 4-1 (depression → EF deficit)**: A 74-year-old scored 30/30 on MoCA (seemingly perfect) but was below average on backward digit span and letter fluency. Depression was the cause — not cognitive decline. Key lesson: **EF failure can be caused by mood state, not cognitive capability**. Vanta's mood region should affect EF availability. A "stressed" or "confused" mood state should reduce ambition of planned actions.

**Case 4-2 (Alzheimer's via EF, not memory)**: A 54-year-old scored 28/30 on MMSE (seemingly fine) but had profound functional impairment. She "felt paralyzed when faced with multifaceted problems" and "was unable to get things together." Key lessons:
1. Surface metrics (test scores) mask functional impairment — `/status green` ≠ ability to execute complex tasks
2. "Paralysis when faced with multifaceted problems" = the exact failure mode EF-COMPLEXITY-GATE prevents
3. "Misrepresented symptoms as memory loss" — agents (and users) may diagnose as "I don't know this" when the real problem is inability to plan/organize

**Case 4-3 (meningioma displacing right frontal cortex)**: A nursing assistant with right inferior frontal cortex displacement presented with "difficulty planning, organization, multitasking." She "made impulsive decisions with poor outcomes" and later "felt paralyzed." Key lesson: **Right hemisphere specializes in self-monitoring and spatial tasks** — the brain region responsible for "does this make sense?" is the right PFC. EF-SELFMONITOR maps directly here.

### MoCA vs MMSE insight (clinically critical)
"MoCA is more sensitive than MMSE for detecting executive dysfunction." The MMSE is a simple pass/fail (28/30 looks fine). MoCA tests actual executive sub-components.

For Vanta: **Vanta's own `/status` is MMSE-level (structural health check). We need a MoCA-level functional assessment** — can Vanta actually complete a multi-step task correctly? This is distinct from "does the kernel respond" or "does the provider work."

### Tower of London = the factory planner problem
The Tower of London test (moving colored beads across pegs to reproduce a target design in as few moves as possible) is the canonical planning test. For Vanta: implementing a feature is Tower of London — minimum tool calls, correct sequencing, target state. The factory planner is solving this problem. The BRAIN-NEURO architecture should include a planning substrate that explicitly models goal states and transition sequences.

---

---

## The Four Core EF Components (and what Vanta must counteract)

### 1. Working Memory
**Definition:** Temporarily processes, stores, and manipulates information in conscious awareness.  
Subdivides into phonologic loop (verbal) and visuospatial sketchpad (visual).

**Failure modes:**
- Losing the thread mid-task ("what was I doing?")
- Forgetting what you were holding while doing a subtask
- Multi-step tasks collapsing to the most recently remembered step
- Context compaction silently deleting goal context

**Current Vanta mitigations:**
- `/moim` — volatile top-of-mind note injected every turn ✓
- `/next` — surfaces the next micro-step from active goals ✓
- Session persistence + resume ✓

**Gaps — requirements for Vanta:**
- **Active task stack** that persists through context compaction (not just MOIM string)
- **Breadcrumb trail** before entering a subtask: "returning from [subtask] → back to [parent]"
- **Goal re-injection** after compaction: re-assert the active goal at the top of the next turn
- **Working memory budget**: explicit cap on how many "active concerns" can be held; anything over → park immediately
- **"Where was I" command** (`/where`) that surfaces the last stated intent + last N tool calls

### 2. Inhibition
**Definition:** Ability to suppress prepotent (automatic/habitual) responses to meet current goals.  
Failures: impulsivity, stimulus-bound behavior, utilization behavior, perseverative loops.

**Failure modes (in an AI agent):**
- Scope creep: "while I'm here I'll also fix..." mid bug-fix
- Starting feature B before feature A is complete
- Going down rabbit holes when asked a simple question
- Repeating the same failed approach (perseveration)
- "Automatic" tool calls that aren't justified by the stated goal

**Current Vanta mitigations:**
- Anti-drift rules in CLAUDE.md ✓
- "No while-we're-at-it" rule ✓
- `MAX_IDENTICAL_CALLS = 3` loop guard in agent.ts ✓
- Kernel `assess()` gate ✓

**Gaps — requirements for Vanta:**
- **Pre-action goal check**: before each tool call, soft-verify "does this serve the active goal?" — surface as a note when it doesn't
- **Scope boundary logging**: log when a tool call is adjacent-to (but not directly serving) the stated goal
- **Perseveration detector**: track approach diversity, not just identical calls — flag when 3+ consecutive tool calls follow the same pattern without progress
- **Anti-impulsivity gate for destructive ops**: even with approval, add a "what does this achieve toward [goal]?" annotation before executing

### 3. Set Shifting
**Definition:** Modifying attention and behavior in response to changing circumstances.  
Failures: perseverative thoughts/behaviors, mental rigidity, multitasking difficulty.

**Failure modes (in an AI agent):**
- Persisting with a failing approach instead of pivoting
- Missing that circumstances changed (user clarified, new info arrived)
- Context pollution: residue from previous task bleeds into current
- Inability to fully reset when `/clear` is called

**Current Vanta mitigations:**
- ERRORS.md (append-only failure log) — but human-checked only ✓ (partial)
- "Two failed attempts → stop, surface options" rule ✓
- `/clear` context restart ✓

**Gaps — requirements for Vanta:**
- **Auto-read ERRORS.md** before similar tasks: detect if current task matches a prior failure pattern and surface the lesson
- **Automatic strategy rotation** after N non-progressing iterations: detect stall, switch approach without being asked
- **Explicit task boundary**: when topic shifts mid-session, insert a marker that clears "set" so prior approach doesn't contaminate
- **"What changed?" briefing** when resuming after a break: what is new since last time this topic appeared

### 4. Fluency
**Definition:** Maximizing production of verbal/visual information in a time window while avoiding repetition.  
Three types: category (semantic), letter (phonemic), design fluency.

**Failure modes (in an AI agent):**
- Suggesting the same solution repeatedly
- Formulaic/monotonous responses
- Failing to generate multiple candidate approaches before picking one

**Current Vanta mitigations:**
- `/planmode` — plan-first toggle ✓
- Brainstorming skill ✓

**Gaps — requirements for Vanta:**
- **Multi-approach generation** for non-trivial tasks: when asked to solve X, generate 2-3 approaches before committing
- **Response diversity tracking**: detect when answers are becoming formulaic and vary style/angle
- **Semantic fluency for search**: when one search query fails, try a category-shifted reformulation automatically

---

## Full Clinical Symptom → Vanta Design Matrix

| ED Symptom | Vanta analogy | Current mitigation | Required feature |
|---|---|---|---|
| Difficulty planning/organization | Jumping to code without a plan | /planmode, PRD files | Complexity gate: auto-prompt to plan when request is complex |
| Multitasking problems | Goal drift across a long session | KANBAN WIP limit | Incomplete-thread detector at session start |
| Poor judgment | Irreversible ops without blast-radius check | Kernel gate | Consequence preview before destructive ops |
| Impaired concentration | Tool chain drift away from goal | MOIM | Real-time goal drift alert after N off-goal tool calls |
| Problem-solving difficulties | Stuck loops, same approach repeated | MAX_IDENTICAL_CALLS | Approach diversity tracker + strategy rotation |
| Mental rigidity | Context pollution across tasks | /clear | Explicit task boundary markers + clean-context handoff |
| Impulsivity | "While I'm here" scope additions | Anti-drift rules | Pre-action goal check (soft gate, not hard block) |
| Absentmindedness | Forgetting the goal mid-subtask | /moim | Goal re-injection after compaction; /where breadcrumb |
| Functional impairment despite global ability | Passing tests but not solving the stated problem | FAC-INTENT judge | In-session equivalent: "does this response answer the question?" |

---

## Treatment Approaches → Vanta Architecture

From the paper's treatment section:

| Therapeutic approach | Vanta equivalent |
|---|---|
| External memory aids (planners, smartphones) | MOIM, /next, session persist, brain store |
| Environmental manipulation | System prompt structure, kernel gates, WIP limits |
| Compensatory techniques | /planmode, PARKED.md, KANBAN, /next |
| Repetitive skill training | Skills library, auto-learn from turns |
| Occupational therapy (clarify functional implications) | ND1 /next, clarify tool |
| Cognitive rehabilitation | Structured error recovery (FAC-STALL, ERRORS.md) |
| Breaking tasks into smaller units | /next micro-step, KANBAN cards |
| Self-monitoring support | Background review, post-turn nudge |

---

## The EF Architecture Requirements for Vanta's Brain

Translating EF science into concrete Vanta brain dimensions (extending BRAIN-5D → BRAIN-NEURO):

### Dimension: Activation State
Human: prefrontal working memory buffer vs long-term store vs archive  
Vanta: `active` (in current prompt) → `warm` (retrievable this session) → `cold` (requires explicit recall)

### Dimension: Inhibition Weight
Human: prefrontal cortex suppresses prepotent responses  
Vanta: each memory node carries a `salience_decay` — recently activated nodes suppress older ones of the same type (recency-based inhibition)

### Dimension: Set / Task Context
Human: dorsolateral PFC maintains current "set" (context frame)  
Vanta: explicit `task_context_id` field on working memory entries; switching tasks invalidates the current set; prior set entries are archived, not deleted

### Dimension: Confidence / Epistemic State
Human: prefrontal mediates uncertainty tracking, meta-cognition  
Vanta: `epistemic_state` on memory nodes: `known` / `believed` / `uncertain` / `inferred` / `forgotten`

### Dimension: Prospective Memory
Human: remembering to do something in the future (intention-in-the-future)  
Vanta: `intent` memory type with `trigger_condition` — fires when condition is met (e.g., "next time we touch session.ts, remember X")

### Dimension: Affective Valence
Human: amygdala + OFC track reward/punishment associations  
Vanta: `valence` on experiences: `positive` (worked) / `negative` (failed) / `neutral` — drives which approach to inhibit next time

### Dimension: Source Monitoring
Human: hippocampal-frontal circuit tracks WHERE a memory came from  
Vanta: `provenance` (already in BRAIN-5D): session_id + tool_call_id + user utterance index — prevents confabulation, enables "how do you know that?"

---

## Key Design Principles (from the EF research)

1. **Never destroy context silently.** Working memory failures are catastrophic because the information is simply gone. In Vanta: compaction must explicitly signal what was dropped; goal state must survive compaction.

2. **Inhibition is a gate, not a wall.** The healthy brain inhibits prepotent responses, it doesn't remove the ability to act — it adds a check. Vanta's pre-action goal check should be a soft annotation, not a hard block (hard blocks are for the kernel's Rule Zero).

3. **Set shifting requires an explicit trigger.** The prefrontal cortex doesn't shift sets automatically — it responds to signals. Vanta needs explicit task-boundary events, not implicit drift.

4. **Fluency is about diversity, not volume.** The clinical test measures unique responses, not raw count. Vanta's solution generation should track semantic coverage, not just number of attempts.

5. **Self-monitoring is a right-hemisphere specialty.** Right PFC watches for errors and inconsistencies. Vanta's background review is the equivalent — but it runs post-turn, not pre-action. A pre-action self-monitor ("does this make sense?") would be the architectural completion.

6. **Executive functions are load-sensitive.** They degrade under cognitive load (stress, time pressure, complexity). For Vanta: long context = degraded EF = more drift. The WIP limit and /next are load-management tools, not just productivity tools.

7. **Neuroanatomy is distributed, not localized.** No single region = all EF. Vanta's brain similarly cannot be a single file — it must be a network where different regions are active for different task types.
