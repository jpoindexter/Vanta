# Agentic Harness Engineering (AHE) — quarry notes for Vanta

> Source: https://github.com/china-qijizhifeng/agentic-harness-engineering · paper arXiv 2604.25850v4.
> Captured 2026-06-16. Quarry doc (per STRATEGY.md): steal what serves the pillars, leave the rest.

## Build status (2026-06-16)

**Vanta already HAS a self-improving loop: the `factory/` subsystem** ("bounded
autonomous loop that improves Vanta's own codebase, kernel-enforced"). It maps onto AHE:
factory **compartments** (skeleton/brainstem/reflexes/memory/limbs) = the kernel-bounded
evolve workspace; kernel-protected `factory/*`/skeleton + `holdout.ts` (separate-author
acceptance) = the controllability guardrails; execute→verify→retry/escalate→autonomy-ladder
commit/merge = apply→verify→keep/rollback. So `AHE-EVOLVE-WORKSPACE`/`-GUARDRAILS` and much
of `-AGENT`/`-LOOP` are effectively done.

The genuine gap was a **measured reward**: the factory only checks "didn't break" (tests +
tsc + intent), not a capability score. **Phase 1 SHIPPED** — `vanta eval` (`src/eval/`):
a deterministic task corpus → isolated in-`.vanta` sandbox → real agent run → deterministic
grade → **pass@1 baseline** (`.vanta/eval-baseline.json`). Cards `AHE-EVAL-*` → shipped.

**Phase 2 SHIPPED** — `vanta evolve [iters]` (`src/evolve/`): the closed loop. Each
iteration snapshots the brain → an agent turn edits the brain (memory compartment, L5) to
fix the failing eval tasks → re-runs `vanta eval` → **keeps on score lift, rolls back on
drop** → journals it (`.vanta/evolve-journal.jsonl`, with actual fixes + regressions per
edit). Pure decision logic (`decide.ts`: shouldKeep / diffOutcomes / predictionPrecision)
and the loop (`loop.ts`, injected IO) are unit-tested. Cards `AHE-SELF-EVOLVE`,
`AHE-EVOLVE-LOOP`, `AHE-EVOLVE-AGENT`, `AHE-EVOLVE-WORKSPACE` → shipped.

v0 scope (honest): the evolve target is the **brain only** (the paper's "memory carries the
gain" + simplest rollback); the prediction set is empty (the falsifiable-prediction +
foresight is Phase 3); live lift is unvalidated until run against a real provider.

**Next — Phase 3:** trace-distilled triage (`AHE-TRACE-DISTILLER`) + regression foresight
with real predicted-fix/at-risk sets (`AHE-REGRESSION-FORESIGHT`, the paper's #1 open
problem) + formalize `AHE-EVOLVE-GUARDRAILS` for the evolve path (budget/model tamper-proof)
+ broaden the evolve target to skills/tools (`AHE-INTERACTION-AWARE`).

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

## Paper findings (arXiv 2604.25850v4, 2026) — net-new beyond the repo README

The full paper (Lin et al., Fudan/Peking/Shanghai Qiji Zhifeng — same authors as the
repo) adds empirical detail the README lacked. Headline: 10 AHE iterations lift pass@1 on
Terminal-Bench 2 from 69.7→77.0% (beats human-designed Codex 71.9% and self-evolve
baselines ACE/TF-GRPO); the frozen harness transfers to SWE-bench-verified (+ uses 12%
fewer tokens) and to 3 other base-model families (+5.1 to +10.1pp). Four findings change
how we'd build the AHE-* initiative:

1. **Regression blindness (the #1 open problem).** The evolve loop predicts *fixes* well
   (fix-precision 33.7% / recall 51.4%, ~5× a random baseline) but is **blind to
   regressions** (precision 11.8% / recall 11.1%, only ~2× baseline). "It can justify why
   an edit should help, but cannot name the tasks the same edit is about to break" — this
   causes the non-monotone evolution curve. The paper names *regression foresight* as the
   clearest direction for future loops. → **`AHE-REGRESSION-FORESIGHT`**.
2. **Controllability / no reward-hacking.** The evolve agent writes ONLY in the harness
   workspace; the tracer, verifier, and LLM config are **read-only** and the seed system
   prompt is **non-deletable** — specifically to block an unconstrained self-modifier from
   "disabling the verifier, swapping the model, or raising the reasoning budget." Vanta's
   kernel is the natural enforcer (rule zero). → **`AHE-EVOLVE-GUARDRAILS`**.
3. **Where the gain lives.** Component ablation: the lift concentrates in **tools,
   middleware, and long-term memory**; the **system prompt alone REGRESSES −2.3pp**.
   Factual harness structure transfers across tasks/models; prose-level prompt edits don't.
   → bias `AHE-EVOLVE-AGENT` edits toward structure over prompt prose (card refined).
4. **Non-additive stacking.** Three single-component gains sum to +11.1pp but full AHE only
   nets +7.3pp — stacked edits spend turns on redundant re-checks. "Interaction-aware
   evolution" is future work. → **`AHE-INTERACTION-AWARE`** (low priority).

Other reinforcements (no new cards): k≥2 rollouts/task for a stable pass-rate signal
(→ `AHE-EVAL-SANDBOX`); progressive-disclosure trace files, raw + cleaned (→
`AHE-TRACE-DISTILLER`); a deliberately minimal seed so every added component must earn its
place against measured rollouts (→ the falsifiable-edit decision, DECISIONS 2026-06-16).
