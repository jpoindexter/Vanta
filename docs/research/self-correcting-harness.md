# The Self-Correcting Agent Harness — extract

Source: Akshay Pachaar, *Your Agent Harness Should Repair Itself* (X article, Jun 2026; vendor example = Comet ML's open-source Opik). Third in the harness series — companion to `anatomy-of-an-agent-harness.md`. The extractable value is the **self-correction pattern**, not the product; `SELFHARNESS-*` cards trace here.

## The problem
Observability that ends at the trace is half a product. You get *what* happened (span tree, latency, token cost) but not *why* it broke, *what* would fix it, or any guarantee it won't recur. So an engineer scrolls the trace, forms a theory, hand-patches, and reruns the whole manual loop again on the next model upgrade. "The real bottleneck isn't observability — it's everything that has to happen *after* the trace lands." The harness should run that loop itself.

## The self-correction loop (the flywheel)
`instrument → declare config → failure in prod (captured) → diagnose root cause → propose diff → human approves → rerun against the exact failing input → sandbox verifies (side-by-side trace) → save versioned blueprint → lock the original failure as a regression test → promote → next failure enters the same loop`.

**Every cycle the harness gets harder to break.** The four layers feed each other in one loop, not separate features:
1. **Tracing** — every LLM call / tool / retrieval instrumented automatically; the *active config is recorded with the trace* so a failing input can be re-run reproducibly later.
2. **Diagnosis+fix agent** — reads the span tree (no code access needed) to surface the causal chain ("why did the final answer ignore the retrieved context?"), then with source access identifies the exact lines and proposes a **diff — nothing changes without approval**; reruns the agent against the original failing inputs for side-by-side comparison.
3. **Test suites** — **plain-English assertions** ("the response must never reveal unauthorized info") converted to LLM-as-judge pass/fail, *not* numerical metrics. Every debugged failing trace **automatically becomes a new test case** — the suite grows from real production failures, not synthetic scenarios.
4. **Sandbox** — run the fully-instrumented agent end-to-end on a config change (swap prompt/model/tool), watch the whole graph respond, produce a trace — safely, without touching git; usable by non-developers (PM/QA).

## Principles (the load-bearing ideas)
- **The failing trace is an ASSET, not waste** — diagnosis without a locked test just means you debug the same thing next month. Regression-locking is the compounding value.
- **Put the human only where automation costs more trust than it saves** — root-cause and regression-locking are low-signal → automate; **diff approval is high-signal → keep the human**. (A "where to put the human" rule that refines reversibility-weighted risk.)
- **Tests go stale** — a locked input rots when tools/schema move under it; the suite needs pruning to stay honest.

## Vanta mapping
Vanta already has the kernel gate, ERRORS.md (a failure log), `/verify` + advisor, and delegate/swarm. The gap this sharpens: turn ERRORS.md from a passive log into an active self-correction loop — diagnose a failure, propose a kernel-gated diff, the human approves, rerun the failing input, and **lock it as a regression test** that grows a plain-English assertion suite. Reinforces `PAPER-OBSERVABILITY` (generator-evaluator separation) and `HARNESS-VISUAL-VERIFY`.
