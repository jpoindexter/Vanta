# "From AGI to ASI" (Google DeepMind, 2026) — quarry notes for Vanta

> Source: arXiv 2606.12683v1, Genewein et al., Google DeepMind, June 2026.
> Captured 2026-06-16. Quarry doc (per STRATEGY.md): steal what serves the pillars, leave the rest.

## What the paper is

A **forecasting / theory report** on the transition from human-level AGI to artificial
superintelligence (ASI). It characterizes ASI (via the Legg-Hutter score / AIXI /
Universal AI as the formal upper bound), lists advantages of digital intelligence and
fundamental physical limits, then maps **four pathways** AGI→ASI with their frictions and
open research questions:

1. **Scaling** compute/models/data
2. **Algorithmic paradigm shifts**
3. **Recursive (self-)improvement** — AI automating AI R&D
4. **ASI via group-agent formation** — collectives of agents

## Verdict: mostly NOT card-able for Vanta

Vanta is a **local trusted operator**, not a frontier lab. Run through the STRATEGY.md
filter ("does this make Vanta a better local operator — or just chase the frontier?"),
the bulk of this paper auto-parks:

- The four ASI pathways, singularity / hyperbolic-growth dynamics, multi-agent scaling
  laws, techno-economic forecasting, energy/hardware frictions → **research-org scale**,
  not a local agent feature. Platform-thinking-before-users (§4).
- AIXI / Universal AI / Solomonoff induction / Legg-Hutter score / fundamental physical
  & complexity limits → **theory**; useful framing, nothing to build.
- "Develop benchmarking beyond human-expert performance", "recursive-improvement scaling
  laws", "monitor degree of AI-facilitated research" → **reinforces the existing AHE
  initiative** (`AHE-EVAL-HARNESS`, `AHE-SELF-EVOLVE`, …); no new cards, see below.
- High-bandwidth experience replay for fine-tuning → **already parked** (trajectory /
  datagen pipeline, PARKED.md) — only relevant if Vanta ever fine-tunes.

## What genuinely maps (carded 2026-06-16, all `horizon`)

The paper's *digital-intelligence advantages* (Table 1) and a couple of its open
questions translate into concrete operator features:

| Card | Pillar | Source in paper |
|---|---|---|
| `ASI-CHECKPOINT-RESTORE` | Harness | Table 1 "lossless replication — backup & restore arbitrarily; spawn/halt/resume" |
| `ASI-FLEET-DIGEST` | Operator | Pathway 4 open Q: "how humans meaningfully steer large agent groups producing volumes impossible to consume" |
| `ASI-RECURSION-METRICS` | Cofounder engine | Pathway 3 research: "monitor how much AI facilitates AI R&D + the human-in-loop degree; recursive-improvement scaling laws" |
| `ASI-FORECAST-CALIBRATION` | Solutioning | Recurring theme: "entertain a range of possibilities, uncertainty estimates over forecasts, ensembling, frequently revisit" |

These are `horizon` (forecasting-motivated, not pulled into the active build queue like
the AHE cards were). Promote if/when they earn a slice.

## Reinforcement (no new cards)

The **recursive-improvement pathway validates the AHE self-evolving-harness initiative**
already carded (`AHE-*`). The paper's three recursion mechanisms — AI writing better
algorithms, AI running experiments autonomously, AI producing better training data — are
exactly what `AHE-EVOLVE-AGENT` + `AHE-EVOLVE-LOOP` target. Its call to "formulate
recursive-improvement scaling laws / track human-in-loop degree" becomes
`ASI-RECURSION-METRICS` (instrumentation on that loop).
