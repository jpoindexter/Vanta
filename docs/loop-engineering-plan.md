# Loop Engineering — native plan (2026-06-11)

> Source: "loops > prompting" shift (Steinberger / Cherny / Osmani / CC dynamic workflows, June 2026), the agent-looping playbook, and a survey of 6 local skill repos (ai-agent-skills, neurodivergent-agent-skills, skills×143, theft-kit×797, design-and-ai-skills). Direction: the operator designs loops; Vanta runs them. Skills stay the *prompt* layer; this plan is the *engine* layer — what markdown cannot enforce.

## The thesis

Vanta already has loop *pieces*: cron + gateway tick, the dark factory (triage→plan→execute→verify→commit ladder), subagent spawn/delegate/swarm, goals, per-goal memory + session scratchpad + brain, post-turn self-review, and 10 bundled loop skills. What's missing is the **first-class loop**: a durable object with a trigger, stages, eval gates, budgets, state, and stop rules — enforced by the engine, not promised by a prompt.

Three structural failure modes loops must beat (and a prompt can't): **agentic laziness** (declares done early → objective gates), **self-preferential bias** (grades own work → isolated adversarial verifier), **goal drift** (constraints fade across compaction → loop state re-injection).

## Feature set (filed as roadmap cards)

| Card | What | Steals from |
|---|---|---|
| `LOOP-ENGINE` (rock·L) | First-class loops: `.vanta/loops/` registry — goal, trigger (cron/heartbeat/event), discover→plan→execute→evaluate→improve stages, rubric, stop rules. `vanta loop add/list/run/pause/kill`. Runs on the existing gateway tick. | playbook harness model; standing-loops; CC dynamic workflows |
| `LOOP-STATE` (rock·M) | Durable per-loop state: last-run, in-progress, escalations (human-clear-only), lessons (append-only). Read at wake, written at exit, re-injected after compaction. | loop-state skill; paperclip checkpoint; gstack retro |
| `LOOP-GATES-BUDGETS` (rock·M) | Engine-enforced advance gates (gate cmd must exit 0 / health score ≥ floor) + budgets: max iterations, wall-clock, token; **no-progress kill** (3 zero-delta wakes); accepted-change-rate ledger. `loop.killed` events. | ship-preflight; hill-climb; terminal-bench-loop; gstack health |
| `LOOP-VERIFY` (rock·M) | Native verification primitives: maker/checker isolation (checker never sees maker's reasoning), N-skeptic adversarial fan-out (refute posture, evidence required), tournament (generate→judge→winner), generate-filter. | adversarial-verify; content-engine tournament; playbook eval gates |
| `WAKE-CONTEXT` (pebble·M) | Scoped wakes: gateway injects `{wake_reason, goal_id, approval_id?, since}` so a loop reads the delta, not full history. Approval resolutions are first-class wake triggers. | paperclip heartbeat model |
| `GOAL-DEPS` (pebble·M) | Goals get `blocked_by`/`blocks`; the scheduler auto-starts goals whose blockers are done. Parallel branches fall out of the graph. | paperclip plan→tasks |
| `DECISION-CLASSIFIER` (pebble·M) | Before any HITL gate: classify mechanical (auto-decide silently) vs taste (auto-decide, surface at final gate) vs user-challenge (never auto-decide). Stops loops over-asking AND over-assuming. | autoplan |
| `OPERATOR-PROFILE` (rock·M) | Declared profile (autonomy, scope appetite, risk) vs inferred profile (from observed overrides) with drift flags; per-question ask-preferences; one-way doors always ask. Lives in the brain's user_model. | plan-tune; ties into BRAIN-AUTOLEARN |
| `LEARNINGS-INDEX` (pebble·S) | Per-project learnings (pattern/pitfall/preference) with staleness + contradiction detection, top-K injected at session start. Implemented as project-scoped brain entries (reuses entries/consolidation). | gstack learn; brain synergy |
| `ND-VELOCITY-CLOSURE` (pebble·S) | Native captures:ships ratio (rolling 7d) + >50%-done closure surfacing before new goals. The ND-first guard the EF gates can't do without cross-session counters. | nd-velocity-check, nd-closuregate |
| `LIVENESS-WATCHDOG` (horizon·L) | Kernel-side loop state machine: every loop/goal terminates each tick in {live, waiting, blocked, terminal}; violations (silent stall, runaway recursion) surface as events and halt spawns. | diagnose-why-work-stopped |

## Build order

`LOOP-ENGINE` first (the spine), then STATE → GATES-BUDGETS → VERIFY (each `after` the engine). WAKE-CONTEXT/GOAL-DEPS slot under the gateway. OPERATOR-PROFILE + LEARNINGS-INDEX ride the brain built today. LIVENESS-WATCHDOG waits for kernel work.

## Kept as skills (not native)

Loop-readiness scoring, choice-reduce, complexity-gate, time-blindness ranges, output-density modes — pure prompt behavior, already shipped as skills. The filter: native = needs state, scheduling, isolation, or enforcement.

## RLMT/GRAPE distillation (Patel, Meta AI 2025 — "Understanding RL for Model Training… GRAPE")

Vanta doesn't train weights, so the honest mapping is **GRAPE at the context level**: every mechanism the paper applies as a gradient update, Vanta applies as selection, rubric scoring, critique-reuse, and preference capture — with real local fine-tuning as the horizon.

| Card | Paper concept → agent analogue |
|---|---|
| `RUBRIC-ENGINE` (rock·M, after LOOP-VERIFY) | GRAPE's per-category weighted rubrics; verifiable items run checks, non-verifiable are *atomized* then critiqued; every judge returns reasoning + score + **confidence**; aggregation confidence-weighted; chronically low-confidence items flagged as bad rubric items |
| `RELATIVE-EVAL` (pebble·S) | GRPO/GRAPE advantage: judge candidates **relative to the group mean**, not an absolute bar — robust across hard/easy categories |
| `CRITIQUE-REUSE` (pebble·S) | GRAPE's improver: evaluate emits critique+reasoning, improve consumes it (response+critique→improved response); iterations mix fresh vs improve |
| `PREFERENCE-SIGNALS` (rock·M) | RLHF/DPO data from daily use: approvals, /retry, /undo, edits, tournament outcomes → chosen-vs-rejected pairs in `~/.vanta/preferences.jsonl`; feeds OPERATOR-PROFILE now, fine-tune dataset later |
| `BEST-OF-EXEMPLARS` (pebble·S) | Rejection sampling at the context level: winners become brain-stored exemplars injected as few-shot for similar tasks |
| `STEP-VERIFY` (pebble·S, after LOOP-GATES-BUDGETS) | Process supervision (PRMs > ORMs): gate intermediate stages, not just final output — catches lucky-outcome/broken-reasoning runs |
| `PERSONAL-MODEL-TUNE` (horizon·L) | The real-training path: export the preference dataset, LoRA a local model (Ollama/MLX on the M4 Pro) into a personal model; GRAPE rubrics double as the tune-quality eval |

Not adopted: PPO/TRPO clipping math, value-function learning, KL-regularized losses — meaningless without gradient access. Their *spirit* survives as: trust-region = the factory's max-diff-lines cap; KL-anchor = voice/anti-slop drift guards.
