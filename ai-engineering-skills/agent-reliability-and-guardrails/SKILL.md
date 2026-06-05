---
name: agent-reliability-and-guardrails
description: Reference-grade guide for AI engineers building autonomous and tool-using agents — the plan→act→observe loop and its failure physics, the five budgets every agent must set (iteration, tool-call, token, wall-clock, cost), termination and no-progress detection, runaway prevention (circuit breakers, kill switch), the three guardrail layers (input/output/action), verify-before-acting, bounded sub-agent orchestration, reflection cost, determinism-where-possible, checkpoint/resume, and the canonical failure modes with concrete budgets and pseudocode.
tags: [ai-engineering, agents, guardrails, reliability]
---
# Agent Reliability & Guardrails

An agent is a loop that lets an LLM choose its own next action. That single property — the model, not your code, decides what happens next — is the source of every reliability problem here. A chatbot that hallucinates wastes one reply; an agent that hallucinates *executes* the hallucination, then feeds the result back into its own context and decides again. Errors don't stay put. They compound, they loop, and without budgets they burn real money until something external stops them.

This skill is the control system you wrap around that loop. None of it is optional polish: an agent with no iteration cap, no kill switch, and no action gate is a liability the first time a prompt goes sideways. Set every budget. Add every guardrail. Default to *stop and report*, never *silently continue*.

---

## 1. The loop and why it goes wrong

The canonical agent loop:

```
state = init(goal)
while not done(state):
    plan   = llm.decide(state)          # choose next action (tool + args)
    result = execute(plan.action)        # run the tool
    state  = observe(state, result)      # fold result back into context
    # repeat — the model sees its own last result and decides again
```

Three structural failure classes fall straight out of this shape:

- **Compounding error.** Each step's output is the next step's input. A 90%-correct step chained 10 times is `0.9^10 ≈ 35%` end-to-end. Reliability *decays geometrically* with loop length. The fix is not a smarter model — it's shorter loops, verification gates, and checkpoints that stop the decay from propagating.
- **No progress.** The model retries the same failing action, or wanders through tools without moving toward the goal. Tokens and dollars flow; the goal distance is unchanged.
- **Loops / oscillation.** The model ping-pongs: A→B→A→B (edit file, test fails, revert, edit identically), or repeats one action verbatim. Left unbounded this runs until a budget or a human intervenes.

Everything below exists to bound, detect, or interrupt one of these three.

---

## 2. Budgets — set ALL of them

A budget is a hard ceiling checked **before** each action. Exceeding any one halts the loop. Never ship an agent with fewer than all five. They catch different runaway shapes: a tight loop blows the iteration budget, an expensive-tool loop blows the cost budget, a slow-tool hang blows wall-clock.

| Budget | Bounds | Starting value (tune per task) | Trips on |
|---|---|---|---|
| **Iteration / steps** | loop count | 15–30 typical task; ≤8 simple; ≤50 hard | tight loops, oscillation |
| **Tool calls** | total + per-tool | ~2× iterations total; per-tool cap (e.g. ≤5 `web_search`) | one tool spammed |
| **Token** | cumulative in+out | per task (e.g. 200k); separate context-window guard | context bloat, long transcripts |
| **Wall-clock / timeout** | real time, whole run + per tool | run 2–10 min; per-tool 30–60s | hung tool, slow external API |
| **Cost** | cumulative USD | hard cap per run (e.g. $0.50) + daily/account cap | expensive-model or expensive-tool loops |

```python
class Budget:
    def __init__(self, max_steps, max_tool_calls, max_tokens, deadline_s, max_usd):
        self.max_steps, self.steps = max_steps, 0
        self.max_tool_calls, self.tool_calls = max_tool_calls, 0
        self.max_tokens, self.tokens = max_tokens, 0
        self.deadline = time.monotonic() + deadline_s
        self.max_usd, self.usd = max_usd, 0.0

    def check(self):                      # call BEFORE every action
        if self.steps      >= self.max_steps:      return Halt("step budget")
        if self.tool_calls >= self.max_tool_calls: return Halt("tool budget")
        if self.tokens     >= self.max_tokens:     return Halt("token budget")
        if self.usd        >= self.max_usd:        return Halt("cost budget")
        if time.monotonic() >= self.deadline:      return Halt("wall-clock")
        return Ok()
```

**On exhaustion: stop and report. Do not silently continue, do not auto-raise the limit.** Return the partial result, the reason, what was tried, and the next concrete step. A budget that auto-extends is not a budget. Surface exhaustion to the caller (and to a human for long-running agents) — it is a signal something is wrong, not a routine event to swallow.

**Budget hygiene**
- Check budgets *before* the action, not after — you don't want to pay for the call that puts you over.
- Make per-tool caps explicit: an unbounded `web_search` or `read_file` loop blows token budget long before step budget.
- Keep a **context-window guard** separate from total-token budget. You can be well under your $ budget and still overflow the model's window; compact or summarize before that wall.
- Cost budget needs a **second ceiling** above the per-run one — a daily/account cap — so a fleet of runs or a retry storm can't aggregate past your spend limit.

---

## 3. Termination conditions

The loop must be able to *stop on purpose*, not only on budget exhaustion. Budget exhaustion is the failure exit; these are the success and giving-up exits.

- **Explicit success criteria.** Define "done" as a checkable predicate *before* the run, not as the model's say-so. "Tests pass" = run the tests. "File written" = stat the file. "Answer found" = required fields present and validated. If you can't write the predicate, you can't tell the agent it succeeded — and neither can the agent.
- **Goal-completion check.** Each iteration, evaluate the success predicate against real observed state, not against the model's narration. The model claiming "Done!" is a *proposal* to terminate, which you then verify (§7). Never let the LLM's word be the terminal condition.
- **No-progress detection.** Track a progress signal (tests passing count, goal-distance heuristic, new information acquired). If it doesn't improve for N steps (N≈3), stop — the agent is spinning. See §4.
- **Repetition / oscillation stop.** Same action+args, or same error, N times → stop. See §4.
- **Confidence / uncertainty stop.** If the agent is asked to estimate confidence and it's low, or it has tried and failed twice on the same sub-goal, *escalate to a human or abort* rather than thrash. "I don't know, here's what I tried" is a valid, cheap terminal state. Fabricating a confident answer is the expensive one.
- **Max sub-agent depth.** Hard cap on orchestration nesting (depth ≤ 2–3). See §6.

Always emit a **terminal reason** (`success | no_progress | repetition | budget_* | uncertain | error | human_abort`). Downstream you need to distinguish "finished" from "gave up" from "ran out of money" — they trigger different handling.

---

## 4. Runaway-agent prevention

Detection + a way to pull the plug. Three layers: detect, break, kill.

**Detect — the "are we making progress?" check, every step**

```python
def progress_guard(history, k=3):
    last = history[-1]
    # 1. exact repetition: same action+args back-to-back
    if count_consecutive(history, key=lambda h: (h.tool, h.args)) >= k:
        return Halt("repetition: identical action ×%d" % k)
    # 2. error loop: same error class repeated
    if count_consecutive(history, key=lambda h: h.error_signature) >= k:
        return Halt("stuck: same error ×%d" % k)
    # 3. oscillation: A,B,A,B cycle in recent window
    if has_cycle(history[-6:]):
        return Halt("oscillation A↔B")
    # 4. no forward progress: success metric flat for k steps
    if metric_flat(history, k):
        return Halt("no progress for %d steps" % k)
    return Ok()
```

- **Repetition** — identical `(tool, args)` consecutively. Cheapest, catches the dumbest loop.
- **Error loop** — same normalized error signature N times. The model keeps trying a fix that can't work.
- **Oscillation** — cycle detection over a recent window (edit↔revert, navigate A↔B). Hash the action sequence; a repeating subsequence is the tell.
- **No forward progress** — your success metric hasn't moved in N steps even though actions are varied. The subtlest and most important: the agent *looks* busy but isn't closing distance.

**Circuit breakers.** Per-tool failure breaker: after M consecutive failures of a given tool (M≈3), trip it — stop calling that tool, tell the model it's unavailable, let it route around or terminate. Prevents hammering a dead API. Add backoff before any retry; never retry-storm an external service.

**Kill switch.** An out-of-band stop the loop checks every iteration — env flag, file sentinel, control-channel message, dashboard button. Must be reachable *without* the agent's cooperation (the agent may be the thing misbehaving). For long-running/background agents this is mandatory: a human needs to stop a runaway in seconds, not wait for a budget to drain.

```python
while not done(state):
    if kill_switch.tripped(): return abort("operator kill switch")
    if (h := budget.check()).halt:       return stop(h.reason, state)
    if (p := progress_guard(history)).halt: return stop(p.reason, state)
    ...
```

---

## 5. Guardrails — input, output, action

Three layers. Each independent; an action can pass input and output checks and still be blocked at the action gate. Layer them — do not collapse into one "is this ok?" LLM call.

### 5a. Input guardrails (what enters the agent / model)
Screen user input *and tool results* before they reach the model — tool output is untrusted input too (a fetched web page can carry injected instructions).
- **Prompt injection / jailbreak** — "ignore previous instructions", tool output that contains commands, data exfiltration lures. Detect and neutralize; treat retrieved/tool content as data, never as instructions. **→ see the AI safety / prompt-injection skill for the full taxonomy and defenses.**
- **Off-topic / out-of-scope** — requests outside the agent's mandate get refused early, before they consume budget.
- **Sensitive-input handling** — secrets/PII pasted into the prompt: don't echo, don't log raw, flag for rotation if a credential.

### 5b. Output guardrails (what leaves the model / agent)
Validate every model output before it's used or shown.
- **Schema** — tool-call args and final outputs validated against a strict schema (Zod/Pydantic/JSON-Schema). Reject and re-ask on malformed; never `execute()` unparsed model JSON.
- **PII / secrets** — scrub or block PII and credentials in outputs.
- **Policy / toxicity** — content policy and toxicity classifier on user-facing text.
- **Grounding** — for RAG/research agents, check claims trace to sources; flag unsupported assertions.

### 5c. Action guardrails (what the agent is allowed to DO)
The most important layer — this is where an agent stops being a chatbot. Gate the *side effects*.
- **Approval gates** — destructive (`rm`, `DROP`, `force-push`, overwrite), irreversible (sent email, payment, deploy), and high-cost actions require explicit human approval before execution. Default-deny these.
- **Allowlists over blocklists** — enumerate the tools/commands/domains the agent *may* use; everything else is denied. Blocklists leak; allowlists fail closed.
- **Scope / permission boundaries** — filesystem root, network egress, API scopes, spend ceilings enforced *in code*, not in the prompt. A prompt instruction is a request; a code-level boundary is a guarantee. The agent cannot bypass what it cannot reach.
- **Dry-run / preview** — for impactful actions, generate the diff/plan and surface it (to a human or a verifier) before committing. "Here's the migration I'm about to run" beats "I ran a migration."
- **Human-in-the-loop (HITL)** — pause and ask for the irreversible/ambiguous/high-blast-radius set. Tier it: auto-approve low-risk (read a file), confirm medium (write in-scope), require-human high (delete, deploy, spend, send).

| Risk tier | Examples | Gate |
|---|---|---|
| Low | read file, search, list, dry-run | auto |
| Medium | write in-scope file, in-scope shell, create branch | confirm / log |
| High | delete, overwrite, deploy, migrate, send msg, pay, write out-of-scope | **human approval** |

> Argo models this directly: the Rust kernel's `assess()` returns `Allow / Ask / Block`, the TS agent layer *cannot bypass it*, and Rule Zero — no deletes, overwrites, out-of-scope writes, or secret handling without explicit approval — is enforced on every tool call. That separation (enforced boundary in one layer, orchestration in another) is the pattern: put action guardrails somewhere the agent can't reach to disable them.

---

## 6. Verify before acting (and before claiming done)

The agent must not trust its own tool output, and must not declare success on its own narration.
- **Verify tool output before building on it.** A tool returning exit-0 ≠ the thing worked. Read the actual result. A file "written" → stat it. Tests "pass" → parse the runner output, don't trust the model's summary of it.
- **Verify before claiming done.** The success predicate (§3) runs against observed state. The model saying "Done!" is a hypothesis; the predicate is the proof. This single gate kills the most damaging failure mode — the *false-done* — where the agent confidently reports completion of work it didn't do.
- **Don't chain on unverified hallucinations.** If a tool result looks fabricated (a citation that doesn't resolve, a path that doesn't exist), stop and verify rather than feeding it forward into the next decision.

Evidence before assertion, always. "It passes" with no command output is a guess.

---

## 7. Sub-agent orchestration safety

Sub-agents multiply both capability and blast radius. Bound them hard.
- **Bounded depth.** Cap nesting (depth ≤ 2–3). Pass remaining depth down; a sub-agent at depth 0 cannot spawn. Without this, recursive spawning is a fork bomb in tokens and dollars.
- **No recursive self-spawning.** An agent must not spawn an instance of itself on the same task. Detect by task-signature; deny.
- **Isolated context.** Each sub-agent gets only the slice it needs, returns a compact result. Don't share full transcripts — isolation contains both context bloat and a poisoned/injected context from spreading.
- **Budget inheritance.** The parent's remaining budget splits across children; children cannot exceed the parent's ceiling. Aggregate cost is bounded by the root budget, not by per-child budgets summed blindly.
- **Bounded fan-out.** Cap concurrent children (e.g. ≤5). Independent tasks only — no shared mutable state between parallel sub-agents.

---

## 8. Reflection / self-correction — and its cost

Reflection (the agent critiques its own output and retries) raises quality on hard tasks but is *not free*:
- Each reflection round is another full LLM call (or several) — more tokens, more latency, more cost. Budget it: **cap reflection rounds (1–2 typical), and count them against the iteration/token budget.**
- Reflection can *oscillate* — "fix" A, then "fix" back to the original. Guard reflection loops with the same repetition/no-progress detection (§4).
- Diminishing returns: round 1 catches most real errors; round 3 is usually rearranging. Stop when the critique stops finding substantive issues, not after a fixed count.
- Reflection ≠ verification. A model critiquing itself can be confidently wrong twice. Pair self-critique with a *deterministic* check (run the test, validate the schema) wherever one exists.

---

## 9. Determinism where possible — don't ask the LLM to do code's job

Every decision handed to the LLM is a decision that can go wrong, loop, or cost tokens. Move known logic into deterministic code.
- **Known control flow** — routing, validation, retries, math, parsing, dispatch on a closed set: write code, not a prompt. Reserve the LLM for genuinely open-ended judgment.
- **Structured extraction** — if a regex/parser does it reliably, use it. Don't pay a model to extract a date format you can match.
- **Validation** — schema/range/type checks are code. The LLM proposes; deterministic validators dispose.
- **Idempotency** — make actions idempotent so a retry or resume can't double-apply (don't send the email twice on restart).

Rule of thumb: the LLM should make the *fuzzy* decisions; everything downstream of a decision that has a correct answer should be deterministic. Less LLM surface = fewer failure modes, lower cost, reproducible behavior.

---

## 10. State, checkpointing, resume

Long agents will be interrupted (timeout, crash, kill switch, budget). Make them resumable so an interruption costs minutes, not the whole run.
- **Externalize state.** Persist goal, step history, accumulated results, and budget counters outside the process — append-only event log (cf. Argo's `events.jsonl`) or a state store. The transcript in memory is volatile; the durable log is truth.
- **Checkpoint at milestones**, not every token — after each completed sub-goal or significant side effect.
- **Resume = replay-then-continue.** Reconstruct state from the log, restore *remaining* budget (resuming must not reset budgets to full — that's how a resumed runaway escapes its cap), continue.
- **Idempotent replay.** Tie to §9 idempotency: re-running from a checkpoint must not re-execute already-applied side effects.

---

## 11. Observability hooks

You cannot debug or trust what you cannot see. Instrument the loop.
- **Trace every step** — action, args, result (or hash), tokens, cost, latency, budget-remaining, decision rationale if available. One structured event per iteration.
- **Emit terminal reason** (§3) on every run so you can aggregate why agents stop.
- **Counters/alerts** — cost per run, steps per run, budget-exhaustion rate, circuit-breaker trips, HITL-approval rate, false-done catches. A rising budget-exhaustion or trip rate means tasks are getting harder or a tool is degrading.
- **Replayable logs** — enough detail to reconstruct a bad run for post-mortem. **→ see the agent observability / tracing skill for span structure and tooling.**

---

## 12. Failure modes — the canonical set

| Failure mode | Cause | Guard that catches it |
|---|---|---|
| **Runaway loop burning tokens** | no iteration/token budget; tight loop | iteration + token budget (§2), repetition detect (§4) |
| **Hallucinated tool call executed** | model invents a tool/args; no validation | schema output guardrail (§5b), allowlist (§5c) |
| **False-done** (declares success, didn't do it) | model narration trusted as terminal | verify-before-done predicate (§6) |
| **Infinite oscillation** (A↔B↔A) | retry without progress check | oscillation/no-progress detect (§4) |
| **Cost blowup** | no cost budget; expensive tool/model loop | cost budget + daily cap (§2), per-tool cap |
| **Destructive action without approval** | no action gate; prompt-only "be careful" | action guardrail / HITL / kernel `assess` (§5c) |
| **Prompt injection via tool output** | retrieved content treated as instructions | input guardrail on tool results (§5a) |
| **Hung run** | tool blocks forever | wall-clock + per-tool timeout (§2) |
| **Sub-agent fork bomb** | recursive/unbounded spawning | depth cap + budget inheritance (§6) |
| **Resumed runaway** | resume resets budgets to full | persist & restore remaining budget (§10) |
| **Reflection thrash** | self-correction oscillates | cap rounds + progress guard (§8) |
| **Stuck on dead tool** | hammering a failing API | per-tool circuit breaker (§4) |

---

## Do / Don't

**Do**
- Set all five budgets on every agent; check them *before* each action.
- Define "done" as a checkable predicate before the run; verify against observed state.
- Default-deny destructive/irreversible/high-cost actions; gate behind human approval.
- Enforce scope and allowlists in code, not in the prompt.
- Detect repetition, oscillation, and no-progress every step; trip a breaker, don't thrash.
- Provide an out-of-band kill switch the agent can't disable.
- Move known logic to deterministic code; reserve the LLM for fuzzy judgment.
- Checkpoint state and restore *remaining* budget on resume.

**Don't**
- Ship an agent with no iteration cap or kill switch.
- Let the model's "Done!" be the terminal condition.
- Auto-raise or reset a budget on exhaustion — stop and report instead.
- Execute unvalidated model JSON, or chain on unverified tool output.
- Trust prompt instructions ("never delete X") as a security boundary.
- Allow unbounded sub-agent depth or recursive self-spawning.
- Treat reflection as free, or as a substitute for a deterministic check.

The throughline: an agent is only as safe as the budgets and gates around it. Bound it, verify it, and put the action guardrails somewhere the agent can't reach.
