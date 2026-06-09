---
name: model-routing-and-fallback
description: Reference-grade guide to routing LLM requests across models by cost/latency/quality, escalating hard tasks, and surviving provider failures with multi-provider fallback, circuit breakers, hedging, and honest degraded-mode UX. Use when choosing which model serves a request, building a router/cascade, adding fallback for outages/ratelimits/timeouts, or designing what the user sees when you degrade.
tags: [ai-engineering, routing, fallback, reliability]
---

# Model Routing, Fallback & Degraded Mode

Two problems share this skill. **Routing** = picking the cheapest model that still meets the quality
bar for *this* request (a value decision). **Fallback** = surviving when the chosen model is
unavailable (a reliability decision). Build both — routing without fallback is a single point of
failure; fallback without routing burns money on easy work.

Tiers, not model IDs, are the durable unit: **frontier** (most capable, slowest, ~10–30× cost),
**mid** (workhorse), **small** (fast, cheap, weak). Names shift quarterly; the tier logic does not.

---

## 1. Why route — don't send everything to the frontier model

The frontier model is the wrong default. ~70–90% of production traffic is easy (classification,
extraction, short rewrites, routine Q&A) and a small model handles it at a fraction of the cost and
latency. Routing trades three axes:

| Axis | Frontier tier | Mid tier | Small tier |
|---|---|---|---|
| Cost / 1M tok | $$$ (10–60×) | $$ (3–8×) | $ (1×) |
| Latency (p50 TTFT) | high | medium | low |
| Quality ceiling | highest | good | adequate-on-easy |
| Best for | reasoning, ambiguity, long-horizon agents | most tasks | classify, extract, format |

The win is asymmetric: routing 80% of easy traffic to a small model can cut spend 60–80% with near-
zero quality delta — *if* you escalate the hard 20% correctly. The risk is asymmetric too: route a
hard task to a weak model and the failure is silent (a confident wrong answer), worse than a catchable
error.

**Do** measure your difficulty distribution before picking a default tier. **Don't** pick by gut —
"use the best model" is a budget decision in disguise.

---

## 2. Routing strategies

### Task-kind / complexity routing (start here)
Map known task types to tiers with a static table. Highest ROI, zero added latency, fully debuggable.

```
ROUTE_TABLE = {
  "classify":        small,
  "extract":         small,
  "summarize_short": small,
  "rewrite":         mid,
  "rag_answer":      mid,
  "code_gen":        mid,
  "multi_step_plan": frontier,
  "ambiguous":       frontier,
}
def route(task_kind, signals):
    tier = ROUTE_TABLE.get(task_kind, mid)         # safe default = mid, never small
    if signals.input_tokens > LONG_CTX_THRESHOLD:  # capability override (§ below)
        tier = max(tier, mid)
    return tier
```

### Difficulty estimation
When task-kind is unknown, estimate difficulty from cheap signals *before* the expensive call: input
length, question-word count, code/math presence, retrieval-score spread, constraint count,
conversation depth. Combine into a 0–1 score; threshold into tiers. Keep it a few features — an
over-fit difficulty model is its own maintenance burden.

### Classifier / router model
A tiny model (or embedding + logistic head) reads the request and outputs a tier label. More accurate
than heuristics on messy input; adds one cheap hop of latency. Train on labeled
(request → tier-that-succeeded) pairs from your own traffic.

### Cascade (try cheap → verify → escalate on low confidence)
Run the small model first; accept if a verifier passes, else escalate. Pays the cheap cost on the easy
majority, the full cost only on the hard minority. **The verifier is the whole game** — a weak one
passes bad cheap answers (silent degradation); a paranoid one escalates everything (cascade *plus*
frontier cost).

```
def cascade(request):
    cheap = small.run(request)
    if verify(cheap, request) >= CONF_THRESHOLD:   # self-grade, logprob, judge, or schema check
        return cheap, {"tier": "small", "escalated": False}
    strong = frontier.run(request)                 # bounded: ONE escalation, not a ladder to infinity
    return strong, {"tier": "frontier", "escalated": True}
```

### LLM-as-router vs heuristic vs learned
| Approach | Accuracy | Latency cost | Maintenance | Use when |
|---|---|---|---|---|
| Heuristic (rules/table) | medium | none | low | known task types, hot path |
| LLM-as-router | high | +1 call | low | varied/unstructured input |
| Learned (RouteLLM-style) | highest | tiny (classifier) | high (needs labeled data + retrain) | high volume, stable distribution, cost-critical |

**RouteLLM** trains a binary router on preference data to send each query strong-or-weak at a target
strong-call rate, recovering most frontier quality while routing a large share to the cheap model.
Start heuristic; graduate to learned when volume justifies the labeling pipeline.

### Capability-based routing (a gate, not a preference)
Some requests *require* a capability — route to a model that has it regardless of cost:
- **Vision** → a multimodal model (text-only model can't see the image).
- **Long context** → a long-context model when input exceeds others' windows.
- **Tool/function calling** → a model with reliable structured tool use.
- **Strict JSON / schema** → a model supporting constrained decoding or JSON mode.

This intersects the capability matrix (§6): never route to a model that lacks the required
capability or that silently ignores the param you depend on.

### Cost-aware and latency-aware routing
- **Cost-aware:** track $/request per route; enforce a per-tenant/request budget cap; downgrade a tier
  when a budget threshold is hit (with a degraded-mode signal, §5).
- **Latency-aware:** under a tight SLA (interactive UI, voice), bias toward the lower-latency tier even
  at some quality cost; reserve the slow frontier tier for async/batch work. **Don't** optimize one
  axis blind: cheapest-always tanks quality; fastest-always overpays.

---

## 3. Escalation

Escalation = routing *up* a tier after a first attempt gave evidence it was insufficient. Escalate on:

| Trigger | Signal |
|---|---|
| Low confidence | verifier/judge score below threshold, low token logprobs, model hedging ("I'm not sure") |
| Validation failure | output fails schema/Zod parse, fails tests, fails a business rule |
| Refusal / safety stop | model refused a legitimate task, or truncated |
| Retrieval gap | RAG context thin or off-topic, model says "not in the provided context" |
| Empty / degenerate | blank, repetition loop, wrong language, wrong format |

**Bounded escalation is non-negotiable.** Cap escalations per request (typically **one**: small →
frontier, stop). An unbounded ladder retries forever, multiplies cost, and stacks latency. After the
cap, return the best attempt with a degraded-mode signal (§5) — don't loop.

```
def with_escalation(request, max_escalations=1):
    tier, escalations = small, 0
    while True:
        out = tier.run(request)
        if accept(out) or escalations >= max_escalations:
            return out, {"escalations": escalations, "final_tier": tier.name}
        tier = next_tier_up(tier); escalations += 1   # bounded: terminates
```

**Do** log every escalation with its trigger — escalation rate is a routing-quality KPI (§6). **Don't**
escalate on transient infra errors (timeout, 5xx); that's a *fallback* concern (§4), not a difficulty
signal — escalating a tier won't fix a network blip.

---

## 4. Graceful fallback for failures

Failures are operational, not quality: outage, 429 rate limit, timeout, 5xx, connection reset, region
down. Classify the error, then act — they don't all warrant the same response.

| Error class | Retryable? | Action |
|---|---|---|
| 429 rate limit | yes, after `Retry-After`/backoff | backoff+jitter, then fall over to next provider |
| 500/502/503 | yes, bounded | retry once, then fall over |
| Timeout | maybe | respect timeout budget; hedge or fall over, don't blind-retry |
| 400 / invalid request | **no** | fix the request (e.g. unsupported param, §6); retrying repeats the error |
| 401/403 auth | **no** | alert; never retry a bad key |
| Content filter | **no** | surface to user; not a model-availability problem |

### Retry with backoff + jitter
Retry only retryable classes. Exponential backoff with **full jitter** spreads retries so a recovering
provider isn't hammered by a synchronized herd. Cap attempts (2–3).

```
def backoff_delay(attempt, base=0.5, cap=8.0):
    return random.uniform(0, min(cap, base * 2 ** attempt))   # full jitter
```

### Multi-provider abstraction (prerequisite for fallback)
Fallback requires a uniform interface so the caller doesn't know which provider answered. Normalize
request and response shapes; map each provider's params/errors to a common vocabulary.

```
class Provider(Protocol):
    def run(self, req: ChatRequest, timeout: float) -> ChatResponse: ...
    capabilities: Capabilities      # drives the capability matrix (§6)
```

### Fallback ORDER
Order is policy, not an afterthought. Default: same-quality alternate first (preserve UX), cheaper/
weaker last (preserve availability).

```
FALLBACK_ORDER = [
    primary_frontier,         # 1. intended quality
    alt_provider_frontier,    # 2. same tier, different provider — best UX preservation
    same_provider_mid,        # 3. degrade tier, same vendor
    alt_provider_mid,         # 4. degrade tier + vendor
    cached_or_static,         # 5. last resort — never fail hard (§5)
]
```
Skip any candidate that fails the request's **capability gate** (a vision request on a text-only model
"succeeds" blind). Stop at the first success; emit a degraded signal if the answering tier is below
intended.

### Circuit breaker
Don't retry into a provider you know is down — that wastes the timeout budget on every request. Per
provider: **closed** (normal) → **open** after N consecutive failures (fail fast, skip straight to
fallback) → **half-open** after a cooldown (one probe; success closes it, failure re-opens).

```
class Breaker:
    state, fails = "closed", 0
    def allow(self): return self.state != "open" or self.cooled_down()
    def record(self, ok):
        if ok: self.state, self.fails = "closed", 0
        else:
            self.fails += 1
            if self.fails >= THRESHOLD: self.state = "open"; self.opened_at = now()
```

### Hedged requests
Tail-latency-sensitive paths: if the primary hasn't responded by p95, fire a second request to an
alternate, take whichever returns first, cancel the loser. Cuts tail latency at the cost of duplicate
spend — cap the hedge rate (e.g. ≤5%) so a slow provider doesn't double your bill.

### Timeout budgets
Set a **total** per-request budget and subtract elapsed time before each fallback hop; never let
retries + fallbacks blow the user-facing deadline. A 30s budget allots 8s primary, 8s alternate, then
a cached/partial response — not three sequential 30s waits totaling 90s.

---

## 5. Degraded-mode UX — never fail hard, never lie

When you fall back or downgrade, the user is getting something different from the ideal. The cardinal
rule: **degrade honestly — never silently, never to a hard error.**

| Degradation | What the user sees |
|---|---|
| Fell to slower/cheaper model | answer + subtle "responding in limited mode" note if quality may differ |
| Served cached answer | answer + "showing a recent result" / timestamp |
| Partial result | what completed + "couldn't finish X" + retry affordance |
| Feature flagged off | the capability hidden/disabled, not a crash |
| Fully unavailable | graceful message + ETA/retry, queue position if queued |

- **Honest vs silent:** silently serving a weak model as if it were the frontier one is the most
  dangerous failure mode — users trust a wrong answer they can't tell is degraded. Surface it, subtly.
- **Don't over-apologize either:** a banner on every minor fallback trains users to ignore it. Signal
  proportionally — quiet note for a same-tier provider swap, explicit banner for a real quality drop.
- **Feature-flag down:** under load or partial outage, disable the most expensive optional features
  (e.g. agentic multi-step, long-context summarization) and keep the core path alive.
- **Queue / backpressure:** when capacity is exhausted, queue with a visible position/ETA or shed load
  with a clear "try again shortly" — bounded waiting beats an opaque hang or a 500.
- **Never-fail-hard:** the final fallback is always *something* — cached result, static response, or a
  clear actionable error. A blank screen or stack trace is never acceptable.

**Do:** make degraded mode a designed state with its own copy and telemetry.
**Don't:** let degraded mode be "whatever the exception handler happens to render."

---

## 6. Capability matrix & observability

Maintain a per-model capability table so the router never sends an unsupported param — a top source of
silent 400s and ignored-parameter bugs:

| Model (tier) | Vision | Tools | JSON mode | Max ctx | `temperature` | Notes |
|---|---|---|---|---|---|---|
| frontier-A | yes | yes | strict | 200k | yes | reasoning model may ignore `temperature` |
| mid-B | no | yes | yes | 128k | yes | — |
| small-C | no | partial | best-effort | 16k | yes | weak tool use; verify outputs |
| vision-D | yes | no | no | 32k | yes | route images here |

Use the matrix two ways: (1) **gate** capability-based routing/fallback (§2, §4); (2) **scrub** the
request before sending — strip or translate params the target doesn't support, rather than let the
provider reject or silently ignore them.

**Observability is the other half of routing** — covered fully in the observability/evals skill;
cross-reference rather than duplicate. Route-specific signals to emit: chosen tier, escalation trigger
+ rate, fallback rate per provider, circuit-breaker transitions, cost-per-request by route, latency by
tier, degraded-mode served rate. You can't tune a router you can't see — a creeping fallback rate is
your earliest outage warning.

---

## 7. Cost / quality / latency per route — the tradeoff

Every route is a point in a 3-D tradeoff; make the tradeoff explicit per path:

| Route | Cost | Quality | Latency | Fits |
|---|---|---|---|---|
| small-only | lowest | adequate-on-easy | lowest | bulk classify/extract, autocomplete |
| cascade (small→frontier) | low avg | high (verifier-gated) | low avg, high tail | mixed-difficulty Q&A |
| frontier-only | highest | highest | highest | reasoning, agents, ambiguity |
| hedged frontier | high | highest | low tail | latency-critical premium path |
| mid + capability override | medium | good | medium | general workhorse |

Pick per *task class*, not globally. The cascade's "low average / high tail" is the classic trap:
cheap on average but escalated requests are slow — fine for async, risky for a hard interactive SLA
(prefer a latency-aware direct route there).

---

## 8. Failure modes

- **No fallback → hard outage.** Single provider, no abstraction layer: their 30-minute incident is
  *your* 30-minute incident. Fix: multi-provider abstraction + fallback order (§4).
- **Silent quality degradation.** Falling to a weak model (or weak verifier in a cascade) without
  surfacing it. Users trust confident wrong answers. Fix: degraded-mode signaling (§5) + escalation
  triggers tuned on real failures (§3).
- **Retry storm / thundering herd.** Synchronized un-jittered retries hammer a recovering provider and
  keep it down. Fix: backoff + **full jitter**, bounded attempts, circuit breakers (§4).
- **Sending unsupported params.** Passing `tools`/`temperature`/JSON mode to a model that rejects or
  silently ignores them → 400s or ignored constraints. Fix: capability matrix + request scrub (§6).
- **Routing everything to the cheap model.** Cost-obsessed default tanks quality on the hard minority,
  invisibly. Fix: measure difficulty distribution (§1), keep `mid` as the safe default, never `small`.
- **Cascade that never escalates.** Verifier too lenient (or threshold too low) → bad cheap answers
  pass; cost savings are real, quality loss is hidden. Mirror trap: verifier too strict → escalates
  everything, paying cascade *plus* frontier. Fix: calibrate the verifier against labeled outcomes,
  monitor escalation rate (§6).
- **Unbounded escalation ladder.** Escalating on transient infra errors, or with no cap, loops cost and
  latency upward. Fix: bound escalations (§3); route infra errors to fallback (§4), not escalation.
