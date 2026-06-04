# Executive Dysfunction → Argo Brain Design

Source: Tanner & Sherrat, "Executive Dysfunction in Neurologic Disease"  
PMC4455841 (2015). Cross-referenced against Argo's ND-first design audit.

---

## The Four Core EF Components (and what Argo must counteract)

### 1. Working Memory
**Definition:** Temporarily processes, stores, and manipulates information in conscious awareness.  
Subdivides into phonologic loop (verbal) and visuospatial sketchpad (visual).

**Failure modes:**
- Losing the thread mid-task ("what was I doing?")
- Forgetting what you were holding while doing a subtask
- Multi-step tasks collapsing to the most recently remembered step
- Context compaction silently deleting goal context

**Current Argo mitigations:**
- `/moim` — volatile top-of-mind note injected every turn ✓
- `/next` — surfaces the next micro-step from active goals ✓
- Session persistence + resume ✓

**Gaps — requirements for Argo:**
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

**Current Argo mitigations:**
- Anti-drift rules in CLAUDE.md ✓
- "No while-we're-at-it" rule ✓
- `MAX_IDENTICAL_CALLS = 3` loop guard in agent.ts ✓
- Kernel `assess()` gate ✓

**Gaps — requirements for Argo:**
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

**Current Argo mitigations:**
- ERRORS.md (append-only failure log) — but human-checked only ✓ (partial)
- "Two failed attempts → stop, surface options" rule ✓
- `/clear` context restart ✓

**Gaps — requirements for Argo:**
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

**Current Argo mitigations:**
- `/planmode` — plan-first toggle ✓
- Brainstorming skill ✓

**Gaps — requirements for Argo:**
- **Multi-approach generation** for non-trivial tasks: when asked to solve X, generate 2-3 approaches before committing
- **Response diversity tracking**: detect when answers are becoming formulaic and vary style/angle
- **Semantic fluency for search**: when one search query fails, try a category-shifted reformulation automatically

---

## Full Clinical Symptom → Argo Design Matrix

| ED Symptom | Argo analogy | Current mitigation | Required feature |
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

## Treatment Approaches → Argo Architecture

From the paper's treatment section:

| Therapeutic approach | Argo equivalent |
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

## The EF Architecture Requirements for Argo's Brain

Translating EF science into concrete Argo brain dimensions (extending BRAIN-5D → BRAIN-NEURO):

### Dimension: Activation State
Human: prefrontal working memory buffer vs long-term store vs archive  
Argo: `active` (in current prompt) → `warm` (retrievable this session) → `cold` (requires explicit recall)

### Dimension: Inhibition Weight
Human: prefrontal cortex suppresses prepotent responses  
Argo: each memory node carries a `salience_decay` — recently activated nodes suppress older ones of the same type (recency-based inhibition)

### Dimension: Set / Task Context
Human: dorsolateral PFC maintains current "set" (context frame)  
Argo: explicit `task_context_id` field on working memory entries; switching tasks invalidates the current set; prior set entries are archived, not deleted

### Dimension: Confidence / Epistemic State
Human: prefrontal mediates uncertainty tracking, meta-cognition  
Argo: `epistemic_state` on memory nodes: `known` / `believed` / `uncertain` / `inferred` / `forgotten`

### Dimension: Prospective Memory
Human: remembering to do something in the future (intention-in-the-future)  
Argo: `intent` memory type with `trigger_condition` — fires when condition is met (e.g., "next time we touch session.ts, remember X")

### Dimension: Affective Valence
Human: amygdala + OFC track reward/punishment associations  
Argo: `valence` on experiences: `positive` (worked) / `negative` (failed) / `neutral` — drives which approach to inhibit next time

### Dimension: Source Monitoring
Human: hippocampal-frontal circuit tracks WHERE a memory came from  
Argo: `provenance` (already in BRAIN-5D): session_id + tool_call_id + user utterance index — prevents confabulation, enables "how do you know that?"

---

## Key Design Principles (from the EF research)

1. **Never destroy context silently.** Working memory failures are catastrophic because the information is simply gone. In Argo: compaction must explicitly signal what was dropped; goal state must survive compaction.

2. **Inhibition is a gate, not a wall.** The healthy brain inhibits prepotent responses, it doesn't remove the ability to act — it adds a check. Argo's pre-action goal check should be a soft annotation, not a hard block (hard blocks are for the kernel's Rule Zero).

3. **Set shifting requires an explicit trigger.** The prefrontal cortex doesn't shift sets automatically — it responds to signals. Argo needs explicit task-boundary events, not implicit drift.

4. **Fluency is about diversity, not volume.** The clinical test measures unique responses, not raw count. Argo's solution generation should track semantic coverage, not just number of attempts.

5. **Self-monitoring is a right-hemisphere specialty.** Right PFC watches for errors and inconsistencies. Argo's background review is the equivalent — but it runs post-turn, not pre-action. A pre-action self-monitor ("does this make sense?") would be the architectural completion.

6. **Executive functions are load-sensitive.** They degrade under cognitive load (stress, time pressure, complexity). For Argo: long context = degraded EF = more drift. The WIP limit and /next are load-management tools, not just productivity tools.

7. **Neuroanatomy is distributed, not localized.** No single region = all EF. Argo's brain similarly cannot be a single file — it must be a network where different regions are active for different task types.
