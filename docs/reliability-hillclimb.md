# Reliability hill-climb — readiness proof

Self-paced loop (skill: `hill-climb`) driving the readiness bar to proven. **Metric = unproven
readiness cards remaining.** Target = **0** (every Pillar-1 reliability card proven/shipped).
Stop at 0, or after 3 consecutive wakes with zero delta.

> The bar (STRATEGY §"The readiness bar"): "a long autonomous run finishes verified work without
> babysitting", measured not asserted. These cards are the gaps the stress-test + discovery pass
> (2026-06-27) surfaced. Each is proven by an executed harness run, not a code-path argument.

## Scoreboard

| Card | Proves | Status |
|------|--------|--------|
| RELIABILITY-LONG-RUN-PROOF | a long autonomous run finishes unattended (riskiest) | ✅ PROVEN — 12/12 reliable + completed (scope-corrected) |
| RELIABILITY-PROVIDER-HARDENING | codex request/idle timeout + transient-error retry (latent, found here) | 🟡 part 1 shipped (codex idle-timeout, test-verified); part 2 (turn-loop transient retry) remaining |
| RELIABILITY-HEADLESS-MULTITURN | headless multi-turn works, or `run`-only is the decision | ❌ unproven |
| RELIABILITY-SCORED-EVAL-CI | pass-rate tracked over time | ❌ unproven (after long-run) |
| RELIABILITY-PROVIDER-VARIANCE | battery green on ≥2 providers | ❌ unproven |
| RELIABILITY-CONCURRENCY-SOAK | kernel survives ≥32× parallel | ❌ unproven |

**Unproven: 5 / 6** (long-run proven; +1 new hardening card spun off).

## Wake log

(per wake: `Unproven before → after (delta) | did: <what> | evidence: <real run result>`)

- **Wake 1** (long-run proof): 5→5 net (−1 long-run proven, +1 hardening found). **Built** `scripts/reliability-longrun.sh` (one big multi-stage task ×N, scored reliable+completed). **Found** the early ~80% was a self-inflicted confound — my task wrote/read `/tmp` (out-of-scope) → `read_file` refused unattended → derail/hang. Fixed the harness (in-scope `/tmp` zone + honest run-count). **Evidence:** scope-corrected re-run = **12/12 reliable + 12/12 completed (100%)** → keystone PROVEN. **Spinoff:** the captured hang exposed two real-but-latent provider gaps (codex no request/idle timeout vs openai.ts; `turn-loop.ts:257` re-throws transient errors) → new card RELIABILITY-PROVIDER-HARDENING, fixing next.
