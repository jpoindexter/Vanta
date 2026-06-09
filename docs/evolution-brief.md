# Vanta Next Evolution — Claude Briefing

## Purpose

This document is intended for an AI coding agent, not for human presentation.

Use it as a build brief for evolving Vanta from a capable tool-using agent into a coherent trusted operator that maintains task continuity, closes loops, and protects Jason's attention.

The goal is not to add more tools. The goal is to make Vanta behave like command infrastructure.

---

## Current verified build state

Repository: `jpoindexter/Vanta`

Active branch: `feat/v1`

Current high-level status:

- Vanta v1 is effectively shipped.
- Core Rust safety kernel exists.
- TypeScript agent loop exists.
- Tool system exists across code, web, browser, vision, Gmail, calendar, Drive, git, memory, skills, roadmap, delegation, and screenshots.
- Prompt system exists and has recently been updated to make Vanta more direct-warm instead of cold/sterile.
- Roadmap snapshot from `roadmap.json` at the time of this brief:
  - `335` total cards
  - `190` shipped
  - `106` next
  - `39` horizon
  - `0` building

Important local caveat:

There may be unrelated dirty files in the working tree. Before coding, inspect `git status` and do not include unrelated changes.

Known dirty files from recent session:

```text
 M .argo/approvals.tsv
 M .argo/events.jsonl
 M PARKED.md
 M roadmap.json
?? tmp/
?? vanta-ts/scripts/add-cc-map.ts
```

Do not assume these are yours.

---

## Product diagnosis

Vanta's bottleneck is no longer raw capability.

The bottleneck is coherence.

Current failure mode:

- Vanta can use tools.
- Vanta can answer questions.
- Vanta can inspect files and run tests.
- Vanta can remember some things.
- Vanta can update roadmap cards.

But Vanta does not yet strongly maintain a living operational stack:

- What are we doing now?
- What is blocked?
- What is almost done?
- What did Jason open but not close?
- What should be forced to a decision?
- What should be parked or killed?
- What is the next action that creates motion?

The next evolution is not “smarter chat.”

The next evolution is:

> Vanta closes loops like a second nervous system.

---

## Target identity

Vanta should become a direct, warm, high-agency trusted operator.

Not:

- generic assistant
- code-only tool
- passive chatbot
- cold task machine
- verbose planner
- memory junk drawer
- dashboard toy

Yes:

- command infrastructure
- task-stack owner
- attention protector
- loop closer
- practical debugger
- grounded researcher
- evidence-based pushback engine
- warm operator presence

Tone target:

```text
direct, warm, structured, high-agency, low-bullshit
```

Voice constraints:

- Use contractions.
- Acknowledge friction or correction plainly.
- Do not be fake cheerful.
- Do not glaze.
- Do not use corporate filler.
- Do not sound like a sterile ticket system.
- Be concise when simple.
- Be structured when complex.
- Push back when evidence supports it.

Recent repo-level voice rule was committed as:

```text
Tighten Vanta voice warmth rule
```

Commit:

```text
aedfae9
```

---

## Evolution ladder

### Level 1 — Tool user

Status: shipped.

Capabilities:

- Read files.
- Write files.
- Run scoped shell commands.
- Search web.
- Fetch pages.
- Use browser/vision tools.
- Use Gmail/calendar/Drive with approval gates.
- Run tests/typechecks.
- Use git tools.

This is useful but reactive.

### Level 2 — Trusted operator

Status: mostly shipped.

Capabilities:

- Knows goal before tool use.
- States expected tool result before calling tools.
- Verifies tool output.
- Reports only what was verified.
- Uses safety kernel for boundaries.
- Labels uncertainty.
- Avoids fake completion.
- Uses durable brain/memory.

Still missing: stronger continuity and task-stack behavior.

### Level 3 — Loop closer

Status: next.

Capabilities to build:

- Maintains persistent operator task stack.
- Detects unfinished loops.
- Names blocked work.
- Surfaces almost-done tasks before starting new rabbit holes.
- Converts vague intent into next action.
- Forces choice when too many branches are open.
- Keeps Jason moving toward closure.

This is the highest-value next level.

### Level 4 — Command infrastructure

Status: target state.

Capabilities to build later:

- Live operator dashboard.
- Ambient context awareness.
- Life-wide search.
- Relevance-gated memory.
- Task/risk/model router.
- Proactive attention triage.
- Strong visual/taste memory.
- Cross-system world model.

---

## Build priority

Build order should be:

1. `EF-TASKSTACK`
2. `MEM-RELEVANCE`
3. `OPERATOR-DASHBOARD`
4. `AUTO-ROUTER` / `AUX-MAP`
5. `VISION-COMPARE` / taste memory

Do not start by adding more unrelated tools.

The next correct build is `EF-TASKSTACK`.

Reason:

Vanta needs a persistent operational spine before more sensory or routing capabilities matter.

---

## Primary next build: EF-TASKSTACK

### Problem

Vanta has goals, roadmap cards, memory, and a todo tool, but these are not yet unified into a persistent operator task stack.

The user experience should not depend on Jason reloading context manually.

Vanta should know:

- current active task
- pending tasks
- blocked tasks
- parked tasks
- recently closed tasks
- tasks near completion
- tasks opened by conversation but not resolved
- next recommended action

### Product goal

Create a persistent task-stack system that lets Vanta maintain open loops across sessions and actively bias toward closure.

### Non-goals

Do not build a giant project management system.

Do not create a dashboard first.

Do not add a complex database unless necessary.

Do not replace `roadmap.json`.

Do not confuse roadmap cards with active operational tasks.

Roadmap cards are product/build inventory.

Task stack is live operator attention state.

### Suggested data model

A task stack item should include:

```ts
type OperatorTask = {
  id: string;
  title: string;
  status: "active" | "pending" | "blocked" | "parked" | "closed";
  source: "user" | "agent" | "roadmap" | "memory" | "system";
  createdAt: string;
  updatedAt: string;
  lastTouchedAt?: string;
  priority?: "high" | "medium" | "low";
  confidence?: "verified" | "inferred" | "uncertain";
  why: string;
  nextAction?: string;
  blocker?: string;
  evidence?: string[];
  relatedRoadmapId?: string;
  relatedFiles?: string[];
};
```

Suggested storage:

```text
.vanta/task-stack.json
```

or, if TS layer already has a home/state convention, use the existing project-scoped Vanta state location.

Must be project-scoped, not global-only.

### Required commands / surfaces

Minimum useful slash commands:

```text
/tasks
/tasks add <title>
/tasks close <id>
/tasks block <id> <reason>
/tasks park <id>
/tasks next
```

Optional later:

```text
/tasks link <id> roadmap:<card-id>
/tasks focus <id>
/tasks stale
/tasks reopen <id>
```

### Required behavior changes

At the start of a non-trivial user request, Vanta should inspect whether there is an active task stack.

If there is an active task already and the new request appears unrelated, Vanta should briefly surface the context switch:

```text
We have X still active. This new request looks separate. I can switch, but X remains open.
```

Do not overdo this for casual chat.

If a task is more than roughly 50% complete and not closed, Vanta should bias toward closure before starting another large task.

If a task is blocked, Vanta should record the blocker and recommend the exact decision needed.

If the user says something vague like “what next?” Vanta should use the task stack, not ask from a blank slate.

### Acceptance criteria

A build is acceptable when:

1. Task stack persists across sessions.
2. User can list active/pending/blocked/parked/closed tasks.
3. User can add, close, block, park, and request next task.
4. Vanta can recommend a next action from the task stack.
5. Tests cover storage, status transitions, and next-task selection.
6. Prompt or runtime context includes a compact task-stack summary.
7. Vanta does not spam task-stack warnings on trivial chat.
8. Existing tests still pass.
9. TypeScript typecheck is clean.

### Test expectations

Add co-located tests for:

- reading empty task stack
- adding task
- closing task
- blocking task with reason
- parking task
- selecting next task by status/priority/recency
- serializing/deserializing stack
- compact prompt summary generation
- slash command behavior if commands are implemented

Run:

```bash
cd vanta-ts && npx vitest run
cd vanta-ts && npx tsc --noEmit
```

If Rust kernel is touched, also run:

```bash
cargo test
```

Avoid touching Rust kernel unless there is a strong reason.

---

## Secondary build: MEM-RELEVANCE

### Problem

Vanta has durable brain/memory, but without relevance control, memory becomes noise.

### Goal

Create a relevance gate that classifies what deserves durable memory vs ephemeral session context.

### Classifications

Suggested memory classes:

```text
Durable preference
Durable constraint
Durable fact
Recurring workflow
Correction / lesson
Project state
Ephemeral detail
Noise
Sensitive / do not store
```

### Behavior

Before writing durable memory, Vanta should ask internally:

- Will this still matter in a week?
- Does this change how I should behave?
- Is this a user preference, constraint, or recurring pattern?
- Is this private/sensitive?
- Is this merely task-local?

### Acceptance criteria

- Memory writes are less junky.
- User corrections are preserved.
- Ephemeral details are not promoted.
- Sensitive data is not stored casually.
- Tests cover classification behavior.

---

## Third build: OPERATOR-DASHBOARD

### Problem

Vanta has internal state but it is not visible enough.

### Goal

Build a live dashboard showing operator state.

### Dashboard sections

Minimum sections:

- active task
- pending tasks
- blocked tasks
- recent closures
- current goals
- pending approvals
- recent verified actions
- dirty repo status
- model/provider/cost if available
- next recommended action

### Important constraint

Do not build the dashboard before task stack exists.

Dashboard should visualize the operational spine, not become a decorative status page.

---

## Fourth build: AUTO-ROUTER / AUX-MAP

### Problem

Not all work should hit the same model/provider.

### Goal

Route by task type, cost, risk, and required capability.

### Suggested routing dimensions

```text
simple summarization -> local/cheap
code reasoning -> stronger model
vision compare -> vision-capable model
sensitive local file work -> local when possible
high-stakes planning -> stronger model + verification
bulk classification -> local/batch
```

### Acceptance criteria

- Configurable per-function routing map.
- Safe fallback behavior.
- Cost-aware selection.
- Tests for routing decisions.

---

## Fifth build: VISION-COMPARE / taste memory

### Problem

Vanta needs stronger design judgment and brand continuity.

Known durable user preference:

- Avoid hyper-realistic human imagery in Vanta branding.
- Prefer scalable illustrated or line-drawing identity language.

### Goal

Vanta should compare visual options and maintain taste/brand memory.

### Acceptance criteria

- Can compare multiple images/screenshots.
- Can produce grounded visual critique.
- Can reference known brand preferences.
- Can recommend direction, not just describe.

---

## Operating rules for the coding agent

When implementing any of this:

1. Inspect existing repo docs first:
   - `AGENTS.md`
   - `CLAUDE.md`
   - `vanta-ts/AGENTS.md`
   - `vanta-ts/CLAUDE.md`
   - relevant source files
2. Do not edit `MANIFESTO.md`.
3. Do not autonomously edit Rust kernel files in `src/` unless explicitly approved.
4. Do not include unrelated dirty files in commits.
5. Every code change needs tests.
6. Run focused tests first, then broader tests/typecheck.
7. Commit in small slices.
8. Push after a verified slice if working in the normal Vanta workflow.
9. Report what changed, what was verified, what remains, and next.

---

## Suggested first implementation path for EF-TASKSTACK

### Step 1 — Inspect existing task/goal/todo systems

Look for:

```bash
grep -R "todo\|task\|goal\|roadmap\|handoff\|memory" -n vanta-ts/src | head -120
```

Files likely relevant:

```text
vanta-ts/src/tools/todo*.ts
vanta-ts/src/repl/handlers.ts
vanta-ts/src/repl-commands.ts
vanta-ts/src/prompt.ts
vanta-ts/src/session.ts
vanta-ts/src/agent.ts
```

### Step 2 — Add task-stack module

Suggested path:

```text
vanta-ts/src/task-stack/store.ts
vanta-ts/src/task-stack/types.ts
vanta-ts/src/task-stack/select.ts
vanta-ts/src/task-stack/summary.ts
vanta-ts/src/task-stack/store.test.ts
vanta-ts/src/task-stack/select.test.ts
vanta-ts/src/task-stack/summary.test.ts
```

### Step 3 — Add slash command surface

Integrate with existing slash command registry.

Suggested command:

```text
/tasks
```

Keep parser simple.

### Step 4 — Inject compact summary into prompt

Prompt summary should be small.

Example:

```text
Operator task stack:
Active: EF-TASKSTACK — implement persistent task stack. Next: add store + tests.
Blocked: none.
Pending top 3: MEM-RELEVANCE, OPERATOR-DASHBOARD, AUX-MAP.
```

Avoid dumping the whole stack.

### Step 5 — Add behavior guard

Do not create a giant intrusive warning system.

Implement a small helper that can produce a context-switch note when:

- there is an active task
- user request appears unrelated
- active task is not closed
- request is non-trivial

This can be simple/heuristic first.

### Step 6 — Verify

Run:

```bash
cd vanta-ts && npx vitest run path/to/new/tests
cd vanta-ts && npx tsc --noEmit
```

Then broader:

```bash
cd vanta-ts && npx vitest run
```

---

## Expected user experience after EF-TASKSTACK

User asks:

```text
where do we stand
```

Vanta should answer from task stack and roadmap:

```text
We have one active build: EF-TASKSTACK.
Next action: finish the store tests.
Blocked: none.
Almost closed: voice warmth rule is shipped and pushed.
Recommended move: complete EF-TASKSTACK before opening dashboard work.
```

User says:

```text
let's do something else
```

Vanta should answer:

```text
We can switch. EF-TASKSTACK remains active with store tests next. Want me to park it or keep it active while we branch?
```

User says:

```text
what next
```

Vanta should not ask from scratch. It should use the stack:

```text
Next best move: EF-TASKSTACK store + tests. It unlocks the dashboard and loop-closure behavior. I can start there.
```

---

## Final product thesis

Vanta should not become extra labor.

Vanta should reduce Jason's operational drag.

The next level is achieved when Jason can throw messy intent at Vanta and Vanta reliably:

1. identifies the real active loop,
2. names the bottleneck,
3. takes the safe next action,
4. escalates only when needed,
5. records the state,
6. and pushes toward closure.

That is the evolution from agent to operator.
