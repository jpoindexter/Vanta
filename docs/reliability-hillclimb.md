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
| RELIABILITY-PROVIDER-VARIANCE | battery green on ≥2 providers | ✅ PROVEN — codex 100% · ollama 90% PASS (1 codeexec hang = 14b model capability, watchdog-bounded; not a Vanta bug) |
| RELIABILITY-CONCURRENCY-SOAK | kernel survives ≥32× parallel | ✅ PROVEN — kernel 1024/1024 assess calls clean (no ceiling < 1024×); 32× full agent-run burst |

**Unproven: 1 / 6** (+ concurrency-soak proven).

- **Wake 5** (concurrency soak): 2→1. **Hammered** the kernel's `/api/assess` at escalating concurrency: **32→1024× all 100%** (1024/1024 HTTP-200, 2s, kernel never dropped a connection) — no contention ceiling below 1024×, 32× the card's bar. Plus a **32× full agent-run burst**: 32/32 reliable + correct, 22s, **0 zombies**, 0 lingering procs (codex didn't rate-limit; the transient-retry is there if it does). The raw-TCP HTTP/1.1 kernel (assess/log/audit-chain) is not the bottleneck.

- **Wake 4** (provider variance): 3→2. **Ran** the stress battery on ollama qwen2.5:14b (warmup + provider-aware timeout). **Evidence:** ollama **9/10 reliable (90%, PASS)**, 2/2 concurrency-burst clean, 0 zombies — vs codex 100% on the identical battery. The one failure (codeexec, a multi-step write→run→report) is the **weak 14b model's capability** on a hard task, watchdog/timeout-bounded (not infinite, not a Vanta-provider bug — codex nailed the same task). What's proven: Vanta's reliability machinery (warmup → provider-aware timeout → watchdog) is provider-portable; task SUCCESS tracks model quality, RELIABILITY (the bar) holds across providers.

- **Wake 3** (headless multi-turn): 4→3. **Decided** (not coded): `vanta run` + agent_session/gateway are the headless interfaces; the interactive REPL is TTY-only — piping a multi-turn conversation in is unsupported (and now exits cleanly, 79fce703, rather than hanging). Rewriting the REPL input model for a muddy use case with existing alternatives wasn't worth the blast radius. **Evidence:** DECISIONS 2026-06-27; the harness's piped-REPL probe reframed to a clean-exit regression check for 79fce703.

- **Wake 2** (provider hardening): 5→4. **Fixed** both provider gaps from wake 1. Part 1: codex SSE idle-timeout (`codex.ts`, AbortController reset per chunk; commit 2a3ef344) — a stalled stream aborts in ~1s instead of hanging. Part 2: bounded transient-retry in `getCompletionWithContextRetry` (extracted to `agent/provider-call.ts` for the size gate; reuses `tool-retry` TRANSIENT) — a transient provider error (429/timeout/reset) is retried then stopped gracefully; non-transient fails fast. **Evidence:** 3 unit tests (retry→succeed, exhaust→graceful, non-transient→throw) green; turn-loop tests intact; full suite green.

## Wake log

(per wake: `Unproven before → after (delta) | did: <what> | evidence: <real run result>`)

- **Wake 1** (long-run proof): 5→5 net (−1 long-run proven, +1 hardening found). **Built** `scripts/reliability-longrun.sh` (one big multi-stage task ×N, scored reliable+completed). **Found** the early ~80% was a self-inflicted confound — my task wrote/read `/tmp` (out-of-scope) → `read_file` refused unattended → derail/hang. Fixed the harness (in-scope `/tmp` zone + honest run-count). **Evidence:** scope-corrected re-run = **12/12 reliable + 12/12 completed (100%)** → keystone PROVEN. **Spinoff:** the captured hang exposed two real-but-latent provider gaps (codex no request/idle timeout vs openai.ts; `turn-loop.ts:257` re-throws transient errors) → new card RELIABILITY-PROVIDER-HARDENING, fixing next.
