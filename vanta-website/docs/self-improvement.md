---
id: self-improvement
title: Self-improvement
sidebar_position: 3
---

# Self-improvement

Vanta can improve its own codebase and its own reasoning — bounded, verified, and gated. These are operator-triggered, never silent.

## The self-learning loop — Vanta learns by doing

This is the core idea: **an agent that gets better at your work the more it does it.** After a substantive task, Vanta runs one closed loop, on by default:

1. **Observe** the task it just finished.
2. **Propose** a reusable skill — mint a new one, or refine an existing one.
3. **Eval-gate** it: a proposed skill is adopted only if it passes. The gate rejects thin, one-off, or *refusal-shaped* skills ("tool X is broken, never use it") that would otherwise harden into self-imposed limits.
4. **Adopt or revert**: a passing skill is kept; a failing one is archived (reversibly — nothing is deleted). Adoption is gated, never silent.
5. **Measure**: every cycle is recorded, and recalling a learned skill in a later task counts as reuse.

See what it has learned with **`/learning`** — skills minted, refined, adopted vs gated out, and how often they've been reused:

```
🌱 Self-learning loop
  cycles    7  (5 distinct skills)
  minted    4   refined 3   reused 9   ← improvement + reuse
  adopted   6   gated out 1   (adoption rate 86%)
```

It's on by default (`VANTA_SELF_IMPROVE=0` to disable); adoption is always gated, and a rejected skill is archived, not deleted.

## The factory — improve the codebase

The factory orchestrates autonomous codebase improvement slice by slice, with kernel-enforced safety (the kernel source / "skeleton" is protected; reflexes, limbs, and memory are autonomous).

```bash
vanta improve            # L1 — show suggested fixes (read-only)
vanta factory approve    # L2–L5 — implement / commit / push / merge per autonomy level
```

| Env | Meaning |
|-----|---------|
| `VANTA_AUTONOMY_LEVEL` | 1–5 (default 4 = commit + push) |
| `VANTA_FACTORY_DISABLED` | kill switch |
| `VANTA_AUTONOMY_ALLOW_MERGE` / `VANTA_FACTORY_MERGE_TARGET` | gate + target for L5 merges |

Each change is verified before it's kept. Protected paths (kernel source, factory loops, the manifesto) can never be edited — enforced by the kernel's scope check.

## Evolve — improve the reasoning

The evolve loop improves Vanta's reasoning by editing its long-term **brain** memory to fix failing evaluation tasks.

```bash
vanta evolve [iters]     # default 3 iterations
```

Each iteration: snapshot the brain → propose memory edits (a kernel-gated memory-compartment write) → re-run the eval → **keep on a score lift, roll back on a drop**. It also predicts which tasks an edit will fix and is scored on that precision.

## Evaluations

The deterministic reward signal behind both loops:

```bash
vanta eval <dir>
```

A task corpus (`instruction` + seed files + a deterministic `check` like `file_exists` / `file_contains` / `shell_ok`) is run as *k* rollouts in isolated sandboxes and scored **pass@1** (mean pass rate). Checks are deterministic, so the score can't be gamed.

## The critic (observability)

An independent LLM critic scores a turn so the agent can't grade its own work.

```bash
VANTA_CRITIC=1           # opt-in; fires post-turn when ≥3 tools ran
```

Output is a `[███░░] 7/10` score plus an issues list, judging goal alignment, verification, tool efficiency, and honesty. A stateless anomaly pass (loop / error-spike / blind-write detection) runs alongside it.

> All four are best-effort and operator-triggered. The factory and evolve loops only ever act within the kernel's [safety boundary](./safety-model.md) and Rule Zero.
