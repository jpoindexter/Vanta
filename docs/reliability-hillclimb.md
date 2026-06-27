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
| RELIABILITY-PROVIDER-HARDENING | codex request/idle timeout + transient-error retry (latent, found here) | ✅ PROVEN — both parts shipped + unit-tested (codex idle-timeout; turn-loop bounded transient retry) |
| RELIABILITY-HEADLESS-MULTITURN | headless multi-turn works, or `run`-only is the decision | ✅ RESOLVED by decision — `run` (+ agent_session/gateway) is the headless path; REPL is TTY-only (DECISIONS 2026-06-27) |
| RELIABILITY-SCORED-EVAL-CI | pass-rate tracked over time | ❌ unproven (after long-run) |
| RELIABILITY-PROVIDER-VARIANCE | battery green on ≥2 providers | ❌ unproven |
| RELIABILITY-CONCURRENCY-SOAK | kernel survives ≥32× parallel | ❌ unproven |

**Unproven: 3 / 6** (long-run + provider-hardening + headless-multiturn resolved).

- **Wake 3** (headless multi-turn): 4→3. **Decided** (not coded): `vanta run` + agent_session/gateway are the headless interfaces; the interactive REPL is TTY-only — piping a multi-turn conversation in is unsupported (and now exits cleanly, 79fce703, rather than hanging). Rewriting the REPL input model for a muddy use case with existing alternatives wasn't worth the blast radius. **Evidence:** DECISIONS 2026-06-27; the harness's piped-REPL probe reframed to a clean-exit regression check for 79fce703.

- **Wake 2** (provider hardening): 5→4. **Fixed** both provider gaps from wake 1. Part 1: codex SSE idle-timeout (`codex.ts`, AbortController reset per chunk; commit 2a3ef344) — a stalled stream aborts in ~1s instead of hanging. Part 2: bounded transient-retry in `getCompletionWithContextRetry` (extracted to `agent/provider-call.ts` for the size gate; reuses `tool-retry` TRANSIENT) — a transient provider error (429/timeout/reset) is retried then stopped gracefully; non-transient fails fast. **Evidence:** 3 unit tests (retry→succeed, exhaust→graceful, non-transient→throw) green; turn-loop tests intact; full suite green.

## Wake log

(per wake: `Unproven before → after (delta) | did: <what> | evidence: <real run result>`)

- **Wake 1** (long-run proof): 5→5 net (−1 long-run proven, +1 hardening found). **Built** `scripts/reliability-longrun.sh` (one big multi-stage task ×N, scored reliable+completed). **Found** the early ~80% was a self-inflicted confound — my task wrote/read `/tmp` (out-of-scope) → `read_file` refused unattended → derail/hang. Fixed the harness (in-scope `/tmp` zone + honest run-count). **Evidence:** scope-corrected re-run = **12/12 reliable + 12/12 completed (100%)** → keystone PROVEN. **Spinoff:** the captured hang exposed two real-but-latent provider gaps (codex no request/idle timeout vs openai.ts; `turn-loop.ts:257` re-throws transient errors) → new card RELIABILITY-PROVIDER-HARDENING, fixing next.
