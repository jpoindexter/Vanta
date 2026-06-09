---
name: llm-observability-and-cost
description: Reference-grade guide to production LLM observability and cost attribution — distributed traces and spans for multi-step agents, OpenTelemetry GenAI semantic conventions, the metrics/percentiles that matter, drift detection with online evals, and per-feature/tenant/user cost attribution via span metadata. Real tooling (LangSmith, Langfuse, Phoenix, Helicone, OTel), tables, do/don't, and the failure modes that leave you blind.
tags: [ai-engineering, observability, tracing, cost, monitoring]
---
# LLM Observability & Cost Attribution

You cannot debug, optimize, or cost what you cannot see. Traditional APM assumes deterministic, cheap, fast functions. LLM systems break all three assumptions: the same input yields different outputs, a single user request fans out into a dozen model and tool calls, every call costs real money proportional to tokens, and output quality silently drifts as models, prompts, and data change underneath you. Observability for LLM systems is therefore a first-class engineering discipline, not a dashboard you bolt on later — it is the only way to answer "why did this request fail," "which feature is burning our budget," and "did quality regress after the deploy."

How to use this skill: instrument every LLM call as a span inside a request-level trace (§2), attach the metadata tags that make cost and quality attributable (§5), emit the metrics in §3, watch for drift in §4, and debug from traces in §6. Treat the failure modes in §9 as a pre-ship checklist.

---

## 1. Why LLM observability is its own discipline

- **Non-determinism.** Temperature, sampling, and model updates mean the same prompt produces different responses. You cannot reproduce a bug from inputs alone — you need the *exact* request/response that was captured, including the model version that served it.
- **Multi-step agents.** A modern request is a tree: planner → retrieval → tool call → sub-agent → synthesis. A failure three levels deep surfaces as a vague top-level error. Without nested traces you see the symptom, never the cause.
- **Cost is variable and large.** Spend scales with tokens, not requests. A single runaway agent loop or a bloated context window can cost 100× a normal request. You must measure cost per call to control it.
- **Quality drifts silently.** No exception is thrown when answers get worse. A provider ships a new model snapshot, your RAG corpus shifts, a prompt edit regresses one intent — and nothing alerts unless you measure quality online.

**Concretely, what blindness costs you.** A support agent starts giving wrong answers after a Tuesday deploy. Without traces: you know error rate is flat (it didn't *error*, it answered confidently and wrongly), you can't reproduce the complaint (different output every run), you can't tell if it was the prompt edit, a model snapshot rollover, or stale retrieval, and you have no idea the bad path is also the most expensive one because it retries internally. With traces + tags + online evals: the faithfulness eval dropped at 14:02, every failing trace shows an empty retrieval span, the prompt-version stamp points at the deploy, and the cost-by-feature chart already flagged the spike. Same incident, minutes vs. days.

> The discipline in one line: capture every call with enough structure (trace shape) and enough metadata (tags) that you can later ask *why* it failed and *what* it cost — broken down by the dimensions your business cares about.

---

## 2. Traces & spans — the backbone

A **trace** is one end-to-end request (a user turn, an API call, a scheduled job). A **span** is one unit of work inside it. Model the request as a tree of nested spans so latency, cost, and errors roll up naturally.

```
trace: chat-request (user=u_42, tenant=acme, feature=support-copilot, session=s_9)
├─ span: agent.plan            (llm)      120 tok in / 40 out   180ms
├─ span: retrieval.search      (vector)   k=8, 0.85 top score   45ms
├─ span: tool.get_order_status (tool)     args={id:...} ok      210ms
├─ span: agent.synthesize      (llm)      1340 tok in / 280 out 1.9s
│   └─ span: subagent.summarize (llm)     900 tok in / 120 out  900ms
└─ span: guardrail.check       (eval)     pass                  30ms
```

**Capture on every span:** model + version, prompt (messages/template + resolved variables), response/completion, token counts (input / output / **cached** separately — cached reads are priced lower), latency (TTFT and total), computed cost, tool args + results, error type, and the metadata block (§5). For retrieval spans also capture the query, the k documents returned, and their scores; for tool spans, the raw arguments and return value.

**Nesting & correlation.** Propagate a single `trace_id` across the whole agent run and parent each span to its caller. When a sub-agent or a separate service is invoked, pass the trace context through (HTTP header / message field) so the child spans attach to the same trace. Without this you get orphaned fragments and cannot follow one request.

**Instrumentation pattern.** Wrap each unit of work in a span context — a decorator/`with` block — that opens the span, records inputs, runs the call, records outputs + usage + cost on the way out, and closes it. The pattern:

```
with tracer.span("agent.synthesize", metadata=ctx) as span:
    resp = client.chat(model, messages)
    span.set(input_tokens=resp.usage.in, output_tokens=resp.usage.out,
             cached_tokens=resp.usage.cached, response_model=resp.model)
    span.set(cost=price(model, resp.usage))   # computed, not guessed
    return resp                                # exceptions auto-record error_type
```

Most SDKs (Langfuse, LangSmith, OpenInference/Phoenix) ship decorators that do this; the contract is the same regardless of vendor — open, record, close, and never let an exception escape un-recorded.

### OpenTelemetry GenAI semantic conventions

OpenTelemetry defines **GenAI semantic conventions** so spans are portable across vendors. These conventions are still marked *experimental/incubating* — pin a version and expect attribute names to evolve. The stable, well-known set:

| Attribute | Meaning |
|---|---|
| `gen_ai.system` | provider (`openai`, `anthropic`, `vertex_ai`…) |
| `gen_ai.operation.name` | `chat`, `embeddings`, `text_completion` |
| `gen_ai.request.model` | requested model id |
| `gen_ai.response.model` | model that actually served (snapshot/version) |
| `gen_ai.usage.input_tokens` | prompt tokens |
| `gen_ai.usage.output_tokens` | completion tokens |
| `gen_ai.request.temperature` / `.max_tokens` | sampling params |

Span name follows the pattern `{operation} {model}` (e.g. `chat gpt-4o`). Prompt/response content is recorded as span events (or attributes, gated behind a content-capture flag because of PII — see §7). Emitting OTel-native spans means any OTel backend (Phoenix, Langfuse, Grafana, Datadog) can ingest them without bespoke glue. **Do** capture both `request.model` and `response.model` — provider snapshots silently change behavior and you need the served version to reproduce.

---

## 3. Metrics — what to chart

Metrics are aggregates over spans. Charts and alerts run on these; traces are for drill-down.

| Metric | Why | Watch |
|---|---|---|
| Latency p50 / p95 / p99 | tail latency is the user's reality | **never** average — averages hide the tail |
| TTFT (time to first token) | streaming UX; perceived speed | p95 |
| TPOT / inter-token latency | streaming smoothness | spikes mid-stream |
| Token usage (in / out / cached) | drives cost; bloat detector | rising input = context creep |
| Throughput (req/s, tok/s) | capacity & saturation | vs. provider rate limits |
| Error rate **by type** | timeouts ≠ refusals ≠ malformed | break down, don't sum |
| Cache hit rate | prompt-cache / semantic-cache savings | falling rate = rising cost |
| Retrieval quality | hit@k, MRR, score distribution | for RAG paths |
| Online eval scores | quality you can chart | per intent/feature |
| Tool success rate | agent reliability | per tool |

**Error taxonomy is load-bearing.** A single "error rate" number is useless. Separate: `timeout`, `rate_limit` (429), `context_length_exceeded`, `content_filter`/`refusal`, `malformed_output` (JSON/schema parse fail), `tool_error`, and `upstream_5xx`. Each demands a different fix — retries help timeouts and rate limits, prompt changes help refusals and malformed output, a token budget fixes `context_length_exceeded`. **Do** alert on `malformed_output` rate; a jump usually means a prompt or model change broke structured output.

**Percentiles, not averages — always.** Latency distributions are heavily right-skewed: a p50 of 800ms can hide a p99 of 12s where your most engaged users live. Chart p50/p95/p99 side by side and alert on the *tail*. The same applies to tokens and cost — a p99 token count reveals the runaway-context outliers that an average buries. Compute percentiles in the field at p75+ load, not from a lab benchmark of ten requests.

**Retrieval quality (RAG paths).** For any retrieval-augmented call, treat the retrieval span as a measurable subsystem: track **hit@k** (did a known-relevant doc appear in top-k), **MRR** (how high), and the **score distribution** of returned chunks. A falling top-score or a rising fraction of low-score retrievals is your earliest signal that answers are about to degrade — it precedes the eval-score drop because bad context produces confident-but-wrong output. Also chart the *fraction of calls that retrieved nothing usable* (all chunks below threshold); those are guaranteed hallucination candidates.

---

## 4. Drift detection — catching silent regressions

Nothing throws when quality degrades. You detect drift by measuring continuously and alerting on deltas.

- **Input drift.** The distribution of incoming requests shifts (new topics, longer inputs, a new client). Track input length, language, and intent-classification distribution over time; a shift often precedes a quality drop because your prompts/retrieval were tuned for the old distribution.
- **Output-quality drift.** Run **online evals** on a sample of live traffic: cheap deterministic checks on everything (schema valid, length, refusal markers, toxicity) plus an **LLM-as-judge** on a sampled subset (helpfulness, faithfulness/groundedness, relevance). Run judges asynchronously off the trace stream so they never add user-facing latency; write the score back onto the trace so cost and quality live together. Chart the scores per intent/feature; alert when a rolling window drops below threshold. Calibrate the judge against a human-labeled set first — an uncalibrated judge drifts too, and a judge that disagrees with humans gives you false confidence.
- **Embedding / retrieval drift.** Monitor the score distribution of retrieved chunks and hit@k. Falling top scores mean the query distribution moved away from the indexed corpus, or the corpus went stale — RAG silently degrades here.
- **Model-version change effects.** When the provider rolls a new snapshot (or you change models), watch evals and cost/latency across the cutover. Annotate dashboards with deploys and model changes so a regression lines up with its cause.

**Do** keep a small fixed regression set replayed on every prompt/model change and gate the deploy on it. **Don't** rely only on offline evals — they don't see the live input distribution, so production drift sails past them.

---

## 5. Cost attribution — the discipline, not just $/model

Knowing "GPT-4o cost us $4,000 this month" is nearly useless. You cannot act on a model-level number — you don't know *which feature, customer, or code path* drove it. The actual discipline is **attributing every dollar to the dimensions your business decides on.** It rests on one mechanism: **metadata tags propagated onto every span.**

**The mechanism, end to end:**

1. **Tag every call.** At the entry point, stamp a metadata block and propagate it onto every span in the trace:
   ```
   metadata = {
     request_id, session_id, trace_id,
     user_id, tenant_id,              # who
     feature, workflow, step,         # what product surface
     environment, app_version,        # where
   }
   ```
2. **Compute per-call cost from tokens.** Cost is not stored by the provider per request you can query cheaply — compute it: `cost = input_tokens × price_in + cached_tokens × price_cached + output_tokens × price_out`, using a per-model price table you keep current. **Cached input is priced differently** (often ~10–25% of full input) — count it separately or your numbers will be wrong on cache-heavy workloads.
3. **Roll up by tag.** Because cost lives on tagged spans, every breakdown is a group-by: by `feature`, by `tenant_id`, by `workflow`, by `user_id`, by `model`. The same data answers all of them.

A live spend guardrail reads the same tags it would later aggregate on:

```
def before_call(ctx, est_tokens):
    if spend_today(ctx.tenant_id) > tenant_budget(ctx.tenant_id):
        return Degrade(model="cheaper-model")     # or Refuse(...)
    if est_tokens > MAX_TOKENS_PER_CALL or ctx.step > MAX_AGENT_STEPS:
        return Refuse("token/step ceiling hit")
    return Allow()
```

The guardrail and the chargeback report are the *same* `tenant_id` tag used at two moments — one to prevent overspend, one to bill it.

**What the tags unlock:**

- **Unit economics.** Cost per task, per session, per active user, per resolved ticket. This is the number that tells you whether the product is viable — not the monthly invoice.
- **Cost per *successful* outcome.** Join cost with a success/eval signal on the same trace: `cost ÷ (% traces that succeeded)`. A feature that's cheap per call but fails half the time is expensive per outcome. This metric catches what raw cost hides.
- **Expensive-path discovery.** Group-by `workflow`/`step` to find the spans that dominate spend — usually a giant context window, an agent that loops, or an over-eager retrieval `k`. Optimize the top 3, ignore the long tail.
- **Budget alerts & guardrails.** Alert when a tenant or feature exceeds a daily/monthly budget. Enforce *guardrails* in-line: per-request token ceilings, max agent steps, and a per-tenant rate/spend limit that degrades to a cheaper model or refuses rather than blowing the budget.
- **Showback / chargeback.** Multi-tenant SaaS: roll cost up by `tenant_id` for internal visibility (showback) or actual billing (chargeback). Impossible without per-call tenant tags — this is the single most common thing teams wish they'd instrumented from day one.

| Dimension | Group-by tag | Answers |
|---|---|---|
| Feature | `feature` | which surface to optimize or price |
| Customer | `tenant_id` | margin per account; chargeback |
| User journey | `session_id` | cost of one end-to-end task |
| Code path | `workflow` / `step` | where the spend concentrates |
| Model | `gen_ai.request.model` | mix shift; cheaper-model candidates |

**Worked unit-economics example.** A "summarize document" feature: 2,000 traces/day, avg 6k input + 800 output tokens, success rate 80%. Per-trace cost = `6000×$in + 800×$out`. The invoice says the model cost $X/month — uninformative. The tagged rollup says: $0.024 per *attempted* summary, but $0.030 per *successful* one (you pay for the 20% that fail too), and `workflow=batch-reprocess` is 3% of traffic but 22% of spend because it re-summarizes on every edit. Now you can act: cache summaries to kill the reprocess path, and either fix or fail-fast the 20% so you stop paying for doomed calls. None of that is visible from $/model.

**Do** tag at the boundary and propagate — retrofitting tags onto historical data is impossible. **Don't** settle for model-level cost: it tells you *what* you spent, never *why*, so you can't act on it. **Don't** trust the provider's dashboard total for attribution — it has no idea which feature or tenant a call belonged to; only your tags do.

---

## 6. Debugging with traces

Traces turn "it failed sometimes" into a reproducible artifact.

- **Find the failing span.** Open the trace, scan top-down for the first error or anomalous span (wrong tool args, empty retrieval, a refusal). The tree localizes the fault instead of you guessing across services.
- **Replay.** Re-run a captured trace against a candidate prompt/model with the *exact* recorded inputs. This is the only reliable repro for a non-deterministic system — you froze the inputs at capture time.
- **Diff.** Compare two traces (good vs. bad, before vs. after a prompt change): diff prompts, retrieved context, and outputs to isolate what changed. Diffing the resolved prompt often reveals a template variable that came through empty.
- **Prompt versioning.** Version every prompt/template and stamp the version onto the span. When a regression appears, you can see exactly which prompt version served it and bisect to the change. Tie eval scores to prompt versions to compare them quantitatively before rollout.

**Worked example.** Complaint: "the agent recommends out-of-stock items." (1) Filter traces by `feature=product-rec` + low faithfulness score → 40 bad traces. (2) Open one: the `retrieval.search` span returns 8 docs but the top score is 0.31 (normally >0.7) — retrieval is the failing span, not the LLM. (3) Diff against a good trace: the bad query embedded an empty `category` variable, so the template resolved to a malformed query. (4) The `prompt_version` stamp shows it changed in last night's deploy, which renamed `category` to `product_category` in the data but not the template. (5) Replay the 40 traces against the fixed template → faithfulness back to baseline. The trace tree localized a *retrieval* bug that looked like an *LLM* bug.

---

## 7. Logging, PII & redaction

Prompts and responses routinely contain PII, secrets, and proprietary data — capturing them verbatim creates a compliance and breach liability.

- **Gate content capture.** Make full prompt/response logging a flag, not a default. Redact PII (emails, names, phone/card/SSN patterns) at capture time *before* it leaves the process — a regex/NER scrubber on prompts and completions. For high-sensitivity tenants, log only token counts, metadata, and a content hash — never the body. The hash still lets you detect duplicate inputs and verify a replay without storing the text.
- **Never log secrets.** Strip API keys, auth headers, bearer tokens, and tool credentials from tool-span args and retrieval results before capture. A trace viewer is a place engineers paste links and screenshots — assume anything captured will eventually be seen by someone who shouldn't see it. Maintain a deny-list of arg keys (`authorization`, `api_key`, `password`, `token`) that are always masked.
- **Retention & access.** Set short retention on content (e.g. 7–30 days), longer on metrics/metadata (months — they're not sensitive and you need trends). Lock content access behind role/tenant boundaries. Honor deletion/DSAR requests by keying captures on `user_id`/`tenant_id` so you can purge one subject's traces without touching aggregates.
- **Sampling helps privacy too.** The less raw content you persist (§8), the smaller your exposure surface. Sample content aggressively; keep metrics on everything.

---

## 8. Sampling for volume

At scale you cannot afford to capture full content on 100% of traffic.

- **Tail-based sampling.** Keep all **errored, slow, and high-cost** traces (the ones you'll debug); sample the boring successful ones (e.g. 1–10%). Decide *after* the trace completes so you don't discard the failure you needed.
- **Always-on metrics, sampled content.** Compute metrics and cost on **every** request (they're cheap aggregates), but persist full prompts/responses only for the sampled or flagged set. **Don't** sample cost — partial cost data makes attribution lie.
- **Per-tenant overrides.** Sample more aggressively on high-volume tenants, keep 100% for a customer you're actively debugging.

---

## 9. Tooling landscape

The load-bearing distinction is *how* a tool captures data: a **proxy/gateway** (swap your base URL, zero code change) vs. **SDK/decorator instrumentation** (wrap your code) vs. **OTel-native** (emit standard spans).

| Tool | Capture model | Notes |
|---|---|---|
| **Helicone** | Proxy / gateway | Base-URL swap; fast to adopt, cost/latency/caching out of the box; less deep on custom spans |
| **Langfuse** | SDK / decorator | Open-source, self-hostable; traces, evals, prompt mgmt, cost; OTel-compatible ingestion |
| **LangSmith** | SDK / decorator | Commercial (LangChain); deep tracing, datasets, evals; best inside LangChain/LangGraph |
| **Phoenix (Arize)** | OTel-native | OpenInference/OTel spans, eval- and RAG-focused; self-host friendly |
| **OTel + backend** | OTel-native | Vendor-neutral GenAI semconv into Datadog/Grafana/Honeycomb; most portable, most assembly |

**Choosing:** want zero code change and cost-first → proxy (Helicone). Want self-host + evals + prompt management → Langfuse. Deep in LangChain → LangSmith. Standardizing on OTel across services → Phoenix or raw OTel into your existing backend. **Do** prefer a tool that speaks OTel so you're not locked in; **don't** build a bespoke logging schema you'll have to migrate later.

---

## 10. Failure modes

| Failure mode | Symptom | Fix |
|---|---|---|
| **No per-call metadata** | can't attribute cost or debug a request | tag every span at the boundary (§5) |
| **Only model-level cost** | can't find the expensive feature/tenant | group-by `feature`/`tenant_id` from tags |
| **No online evals** | quality drifts silently, users complain first | sample + LLM-judge live traffic (§4) |
| **Averages, no percentiles** | tail latency invisible; p99 users suffer | chart p50/p95/p99 + TTFT (§3) |
| **One lumped error rate** | can't tell timeout from refusal from bad JSON | error taxonomy (§3) |
| **Logging secrets/PII verbatim** | compliance & breach exposure | gate content capture, redact (§7) |
| **No trace correlation** | agent failure shows as vague top-level error | propagate `trace_id`, nest spans (§2) |
| **Cached tokens priced as full** | cost numbers wrong on cache-heavy paths | count cached tokens separately (§5) |
| **Sampling cost data** | attribution lies | metrics/cost on 100%, sample content only (§8) |
| **No prompt versioning** | regression can't be tied to a change | stamp prompt version on span (§6) |
| **No retrieval metrics** | RAG degrades invisibly until users complain | track hit@k + score distribution (§3) |
| **Async judge in the hot path** | online evals add user-facing latency | run judges off the trace stream (§4) |

## 11. Operating cadence

Observability is a practice, not a one-time setup. The minimum loop that keeps a production LLM system honest:

- **Per deploy:** replay the fixed regression set, diff evals and cost vs. the previous version, annotate the dashboard with the deploy and any model-snapshot change. Gate the release on the regression set.
- **Daily:** scan p95/p99 latency, error-rate-by-type, and cost-per-feature for anomalies; review a sample of low-eval-score traces by hand (the judge isn't perfect — humans catch what it misses).
- **Weekly:** review unit economics (cost per successful outcome) per feature/tenant, check budget burn against limits, and re-rank the expensive paths to optimize next.
- **On every alert:** start from the trace, not the metric. The metric tells you *that* something moved; the trace tells you *why*.

The through-line: **structure** (nested traces) plus **metadata** (tags) plus **continuous measurement** (metrics + online evals) is what turns a non-deterministic, expensive, drifting system into one you can debug, cost, and trust. Instrument it before you need it — you can't retrofit a tag onto a request that already happened, and the trace you didn't capture is the one you'll wish you had.
