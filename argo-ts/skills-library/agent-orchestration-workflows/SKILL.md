---
name: agent-orchestration-workflows
description: "Orchestrate sub-agents (delegate/swarm) to beat agentic laziness, self-bias, and goal drift on big/parallel/adversarial tasks."
---

# Agent Orchestration Workflows

Extracted from Anthropic's "A harness for every task: dynamic workflows in Claude Code"
(Thariq Shihipar & Sid Bidasaria) and mapped to Argo's `delegate` + `swarm` tools.

## Why orchestrate (the failure modes you are fighting)

A single context window degrades on long / massively-parallel / highly-structured-adversarial
tasks. Three named failure modes — watch for them in yourself:

- **Agentic laziness** — stopping before a multi-part task is done (addressing 20 of 50 items, then declaring done).
- **Self-preferential bias** — preferring your own results/findings when asked to verify or judge them.
- **Goal drift** — losing fidelity to the original objective over many turns, especially after context compaction (edge-case requirements and "don't do X" constraints get summarized away).

The fix: give separate sub-agents their **own clean context window and one focused, isolated goal**, then combine. In Argo: `delegate` (one scoped subtask, choose provider/model) and `swarm` (parallel fan-out + synthesize).

## When to use — and when NOT to

Use when the task is **large, parallelizable, or needs independent verification**. Do NOT reach for it on ordinary work — it costs significantly more tokens. Most coding tasks do not need a panel of 5 reviewers. Match the structure to the task; state a token budget up front when you can.

## The patterns (compose these)

- **Classify-and-act** — a classifier sub-agent decides the task type, then routes to the right behavior. (Or classify at the end to shape output.)
- **Fan-out-and-synthesize** — split into many small steps, run a sub-agent per step (clean context each, no cross-contamination), then a **synthesize barrier** merges the structured outputs into one result.
- **Adversarial verification** — for each produced result, spawn a *separate* sub-agent to try to refute it against a rubric. Defeats self-preferential bias (the maker never grades its own work).
- **Generate-and-filter** — generate many candidates, then filter by a rubric / dedupe, return only the highest-quality survivors.
- **Tournament** — N agents each attempt the *same* task differently; judge pairwise (comparative judgment beats absolute scoring) until one winner remains. Good for taste/design/naming.
- **Loop-until-done** — for unknown-size work, keep spawning until a **stop condition** holds (no new findings, no more errors in logs) rather than a fixed number of passes. Beats agentic laziness.

For sorting/ranking many items by a qualitative measure: don't sort 1000 rows in one prompt — run a tournament / pairwise-comparison pipeline or bucket-rank in parallel; the deterministic loop holds the bracket so only the running order stays in context.

## Argo-specific application

- Build from `delegate` (scoped subtask, can pick provider/model — route cheap classify work to local Ollama, hard judging to a stronger model) and `swarm` (parallel + synthesize).
- Pair with **`/goal`** (a hard completion requirement — kills agentic laziness) and a repeat trigger for recurring work (triage, research, verification).
- Quarantine pattern: agents that read untrusted public content must not take high-privilege actions — those go to a separate acting agent. (Argo's kernel `assess()` is the backstop, but separate the roles too.)
- This is the seed of the roadmap `WORKFLOWS` item: Argo writing its own JS orchestration harness on the fly. Until that ships, apply these patterns manually via `delegate`/`swarm`.
- Self-improvement tie-in: "mine recent sessions for corrections you keep making → distil into rules/skills" is exactly Argo's background-review loop (B3/B4) — orchestration is how you do it at scale.

## Checklist before orchestrating

1. Is this big / parallel / adversarial enough to justify the extra tokens? If no → just do it.
2. Which pattern fits (fan-out, tournament, loop-until-done, adversarial-verify)?
3. What is the **stop condition / completion requirement**? State it.
4. Do any sub-agents read untrusted content? Quarantine their privileges.
5. Set a token budget.
