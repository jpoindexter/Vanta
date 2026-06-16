# Agentic Harness Engineering (AHE) — quarry notes for Vanta

> Source: https://github.com/china-qijizhifeng/agentic-harness-engineering
> Captured 2026-06-16. Quarry doc (per STRATEGY.md): steal what serves the pillars, leave the rest.

## What AHE is

A **meta-loop that evolves a harness**, not a harness itself. The base model is held
fixed; what evolves are the harness components. Each iteration runs
`Evaluate → Analyze → Improve`:

- **Evaluate** — the code agent runs in E2B sandboxes over a benchmark (Terminal-Bench 2), producing step-level traces + pass/fail.
- **Analyze** — an "Agent Debugger" compresses 10M+-token traces into layered, *sourced* root-cause reports (claims link back to raw trace lines).
- **Improve** — an "Evolve agent" proposes **evidence-backed, falsifiable edits**: each change ships with failure-evidence → root-cause → fix → *predicted impact*, and the prediction is falsified/confirmed by the next iteration (auto rollback on regression).

Reported result: GPT-5.4 lifted 69.7 → 77.0% on Terminal-Bench 2 over 10 iterations; evolved harnesses **transfer** to SWE-bench-Verified and other base models without re-evolution ("general engineering experience, not benchmark-specific tuning").

Stack: Python 3.13 + `uv`, E2B sandboxes, YAML config, the **NexAU** component framework.

## Why it matters to Vanta

It **validates Vanta's #1 pillar** ("the harness IS the product") and is itself
**pillar-5 territory** (Cofounder/self-improvement engine). AHE does not compete with
Vanta — **it sits on top of a harness.** Vanta is the harness; AHE is a loop you could
point *at* Vanta.

## The striking fit: Vanta is already decomposed the way AHE requires

AHE's evolve-agent may only write 7 file-level components. Vanta already has all 7:

| AHE / NexAU component | Vanta surface (exists today) |
|---|---|
| `systemprompt.md` | 3-tier prompt |
| `code_agent.yaml` | setup / config |
| `tool_descriptions/` + `tools/` | 81 tools + Zod schemas |
| `middleware/` | shell-hooks engine + EF gates |
| `skills/` | skills store |
| `sub_agents/` | agent definitions / subagents |
| `LongTermMEMORY.md` | brain / memory |

Vanta could be an AHE evolution *target* with almost no restructuring.

## The Vanta edge

AHE enforces "the evolve agent may only touch the 7 components" with a plain
`workspace/` directory. **Vanta's kernel already enforces scope on every write** — a
Vanta self-evolution loop would be safer-by-construction than AHE's plain dir boundary.
On-brand for "the kernel is the boundary."

## The gap (why the full loop is not a now-thing)

AHE needs what Vanta lacks:

1. a **benchmark / task set**,
2. **sandboxed eval**,
3. a **reward / verifier signal**.

Vanta has partial traces (`.vanta/events.jsonl`, session memory) but **no eval set and
no reward**. Without that, the evolve loop has nothing to optimize against. Building
self-evolution before real users + an eval set is platform-thinking-before-users —
against §4 of the operating rules.

## Disposition (filed 2026-06-16)

- **Adopt now (cheap, no infra):** the *falsifiable-edit discipline* — every non-trivial
  change carries evidence → root-cause → fix → predicted-impact → verified-next.
  → `DECISIONS.md` 2026-06-16.
- **Roadmap (horizon):**
  - `AHE-EVAL-HARNESS` (Harness) — task set + sandboxed eval + reward. The prerequisite; also gives Vanta a regression eval it lacks.
  - `AHE-TRACE-DISTILLER` (Harness) — Agent-Debugger analog: `events.jsonl` → sourced root-cause report.
  - `AHE-SELF-EVOLVE` (Cofounder engine) — the full evaluate→analyze→improve loop on Vanta's own 7 components, kernel-enforced workspace boundary. Depends on the two above.
- **Reject (PARKED):** importing AHE's code/stack (Python/uv/E2B/NexAU vs Rust/TS).
  It's a methodology to borrow, not a dependency.
