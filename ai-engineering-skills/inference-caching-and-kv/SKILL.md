---
name: inference-caching-and-kv
description: Reference-grade guide to caching in LLM inference — provider prompt caching (Anthropic cache_control breakpoints, OpenAI automatic prefix caching, Gemini implicit/explicit), semantic caching, and KV-cache internals & management (PagedAttention/vLLM, RadixAttention/SGLang, eviction, quantized KV, memory pressure, multi-tenant safety). Concrete numbers, formulas, failure modes.
tags: [ai-engineering, caching, kv-cache, inference]
---

# Inference Caching & KV Cache Management

Three distinct caches get confused under one word. They live at different layers,
have different correctness properties, and fail differently.

| Cache | Layer | Match | Returns | Risk if wrong |
|-------|-------|-------|---------|---------------|
| **Prompt cache** | Provider / serving engine | Exact token-prefix | Skips *prefill* compute, regenerates output | None (cheaper, identical output) |
| **Semantic cache** | Your app, in front of the API | Embedding similarity | A *stored prior response* | Serves a **wrong answer** |
| **KV cache** | GPU, inside the model | Per-token K/V tensors | Enables O(1) decode | OOM / preemption |

Rule of thumb: prompt cache is **exact + cheap + safe** — on always. Semantic
cache is **fuzzy + risky** — use surgically. KV cache is **not optional** (it's
how decode works) and at scale dominates GPU memory.

---

## 1. Prompt caching (provider-level)

### How it works
The model's *prefill* phase computes K/V for every prompt token before the first
output token, at cost O(prompt_length). Prompt caching stores that computed K/V
keyed by an **exact token prefix**; on a hit the engine skips prefill for the
cached span and resumes from the first divergent token. Matching is on **exact
tokens from position 0** — a prefix match, not fuzzy or substring. One changed
byte invalidates everything from that byte onward. Prefill is the dominant cost
for RAG/agent/long-context workloads where the prompt dwarfs the completion, so
caching it turns repeated large prefixes into near-free reads.

**Anthropic** (explicit, `cache_control` breakpoints):
- Cache **write** ≈ **1.25×** base input price (5-min TTL) or **2×** (1-hr TTL).
- Cache **read** ≈ **0.1×** base input price (~90% discount).
- Up to **4 breakpoints**; each marks the end of a cacheable prefix. The engine
  also checks shorter prefixes, so you don't need a breakpoint per turn.
- TTL options: **5 minutes** (default) and **1 hour**. TTL refreshes on each hit.
- Minimum cacheable size: **1024 tokens** (Sonnet/Opus) or **2048** (Haiku).

Break-even: a write costs 0.25× extra (5-min), each read saves 0.9×, so a cached
prefix pays for itself after **~1 reuse within the TTL** (0.25 < 0.9). A 50-call
agent loop reusing a 20k-token system+tools prefix pays 1.25× once + 0.1× × 49
instead of 1.0× × 50 — roughly an **~85% input-cost cut** on that prefix.

**OpenAI** (automatic prefix caching):
- No API flag. Prompts **≥1024 tokens** are auto-cached; matched in **128-token
  increments** (1024, 1152, 1280, …).
- Cached input tokens billed at **~0.5×** (50% off, model-dependent); some newer
  models advertise deeper discounts. No separate write surcharge.
- TTL: evicted after **5–10 min** idle, up to ~1 hr off-peak. Route the same
  prompt family to the same backend with a stable `prompt_cache_key` (or
  legacy `user` field) to raise hit rate.
- `usage.prompt_tokens_details.cached_tokens` reports the hit size.

**Gemini**:
- **Implicit caching** (auto, on by default for 2.5 models, ~0.25× on the cached
  portion, needs the common prefix at the *start* of the request) plus **explicit
  caching** (`CachedContent` — you set TTL, get a guaranteed discount + a storage
  fee per token-hour).

### Stable-prefix design (the one thing that makes or breaks hit rate)
Order the prompt **most-stable → most-volatile**:

```
[ system instructions ]   ← never changes        ┐
[ tool / function defs ]   ← changes per deploy   │ cache this prefix
[ static context: docs,    ← changes per session  │ (breakpoint here)
  schemas, few-shot ]                             ┘
------------------------------------------------- ← cache breakpoint
[ retrieved chunks ]       ← per query   ┐ keep AFTER the breakpoint
[ conversation history ]   ← per turn    │ so the stable prefix
[ user's current message ] ← per call    ┘ survives
```

```python
# Anthropic: cache the big static prefix, leave volatile tail uncached
messages = [{
  "role": "user",
  "content": [
    {"type": "text", "text": SYSTEM_AND_TOOLS},            # stable
    {"type": "text", "text": STATIC_DOCS,
     "cache_control": {"type": "ephemeral", "ttl": "1h"}}, # breakpoint
    {"type": "text", "text": user_query},                  # volatile, uncached
  ],
}]
```

**Cache hit rate** is the metric. Track:
`cache_read_tokens / (cache_read + cache_write + uncached_input)`. Healthy
agent/RAG loops hit **60–90%+**. A sudden drop to ~0% means the prefix went
unstable (see failure modes).

### What silently breaks a prefix
- A timestamp, request ID, UUID, or `Date.now()` injected into the system prompt.
- Reordering tools, or non-deterministic JSON key order in tool schemas.
- Trimming/whitespace differences, locale-formatted numbers, or a model/version
  swap (cache is per exact model).
- Putting retrieved/volatile content **before** the static block.
- Per-user personalization spliced into the *front* instead of the tail.

---

## 2. Semantic caching

Embed the incoming query → nearest-neighbour search in a vector store → if a
stored entry is within a similarity threshold, **return its cached response**
without calling the model.

```python
def semantic_lookup(query, threshold=0.92):
    q = embed(query)
    hit, score = vector_store.nearest(q)           # cosine similarity
    if score >= threshold and not is_stale(hit):
        return hit.response                        # skip the LLM entirely
    resp = call_llm(query)
    vector_store.upsert(embed(query), resp, ts=now())
    return resp
```

### When it helps
- High-repetition, low-variance intents: FAQ bots, support deflection, classifier
  prompts, doc Q&A where many users ask the same thing different ways.
- Workloads with a **long tail of paraphrases** of a small set of questions.

### When it hurts (don't use it)
- Personalized, stateful, time-sensitive, or computational answers ("what's *my*
  balance", "current price", "summarize *this* doc"). Two queries that *look*
  similar can require different answers.
- Anything where a wrong-but-plausible answer is costly.

### Thresholds & the false-hit risk
- Cosine **0.95+** is conservative (fewer hits, few false hits); **0.85–0.90**
  is aggressive (more hits, real false-hit risk). Tune on labelled pairs, not
  vibes — measure precision of "same intent" at each threshold.
- **False hit** = two semantically *different* queries score above threshold and
  the cache serves the wrong stored answer. This is the defining hazard:
  embeddings collapse negation ("can I cancel" vs "can I *not* cancel"), numbers,
  and entities. Mitigate: raise threshold, add a cheap LLM/rule re-rank gate on
  borderline hits, key on normalized intent + critical entities, never cache
  responses containing user-specific data.
- **Staleness**: cached answers go wrong when the underlying truth changes
  (price, policy, docs). Attach a TTL and a content-version tag; invalidate by
  version bump or event, not just time. Always cache *with* an embedding model
  version — re-embedding on model change is required.

### Prompt-cache vs semantic-cache
| | Prompt cache | Semantic cache |
|---|---|---|
| Match | Exact prefix | Fuzzy (embedding) |
| Returns | Recomputed correct output | Stored prior output |
| Correctness | Always correct | Can serve wrong answer |
| Saves | Prefill compute / input cost | Whole inference call |
| Owner | Provider/engine | You |
| Default stance | **On always** | **Off until justified** |

They compose: semantic cache catches whole-query repeats; prompt cache makes the
*misses* cheaper. Layer semantic in front, prompt cache underneath.

---

## 3. KV cache internals

### What it is
During decode, each new token attends to **all previous tokens'** keys and values.
Recomputing K/V for the whole sequence every step is O(n²) total. Instead the
engine **caches K and V per token per layer** once, so each decode step only
projects the one new token and attends against the cached set — **O(1)** in
past-token work. The KV cache is what makes autoregressive decode tractable, and
it grows by one token's worth of K/V every step.

### Memory cost — the formula
```
kv_bytes = 2 · num_layers · num_kv_heads · head_dim · seq_len · batch · dtype_bytes
           │
           └─ the 2 is for K *and* V
```
`num_kv_heads` is the **GQA/MQA** head count (often ≪ attention heads — this is a
primary KV-memory lever). `dtype_bytes`: FP16/BF16 = 2, FP8/INT8 = 1.

**Worked example — Llama-3-8B**, 32 layers, 8 KV heads (GQA), head_dim 128, FP16:
- Per token: `2 · 32 · 8 · 128 · 2 = 131,072 B ≈ 128 KiB/token`.
- 8k-token sequence: `128 KiB · 8192 ≈ 1.0 GiB`. Batch of 32: **~32 GiB of KV** —
  on top of ~16 GiB of FP16 weights. On an 80 GB A100/H100 you are KV-bound long
  before weight-bound.

**Llama-3-70B** (80 layers, 8 KV heads, head_dim 128, FP16): ~320 KiB/token → a
single 32k-context request needs **~10 GiB of KV by itself**. KV cache, not
weights, sets the throughput ceiling at long context / high batch.

Takeaway: **KV scales linearly with seq_len × batch**; weights are fixed. Past a
point, KV dominates total memory.

---

## 4. KV cache management

### PagedAttention (vLLM)
Naive serving pre-allocates a contiguous KV buffer sized to `max_seq_len` per
request → internal fragmentation and reserved-but-unused memory (often 60–80%
waste). PagedAttention borrows OS virtual memory: KV is split into **fixed-size
blocks** (e.g. 16 tokens), stored **non-contiguously**, with a block table mapping
logical → physical. Result: near-zero fragmentation, on-demand allocation, and
**copy-on-write block sharing** for identical prefixes (parallel samples, beam
search, shared system prompts). vLLM reports up to ~2–4× throughput vs naive
allocation, mostly from packing more concurrent sequences into the same VRAM.

### Prefix sharing / RadixAttention (SGLang)
Caches prefixes in a **radix tree** keyed by token sequence, so any request
sharing a prefix (system prompt, few-shot block, multi-turn history,
tree-of-thought branches) **reuses** the computed KV instead of re-running
prefill (LRU eviction on the tree). Automatic cross-request KV reuse — the
server-side analogue of provider prompt caching. Huge for agent fan-out;
hit rates of 50–90% are common. vLLM's `--enable-prefix-caching` does the same
via hashed block reuse.

### Eviction & scheduling
KV blocks are a finite pool. When full:
- **LRU / priority eviction** of cached (non-active) prefix blocks first.
- **Preemption** of *running* sequences when even active KV won't fit:
  - **Recompute**: drop the sequence's KV, re-run prefill later. Cheap memory,
    costs compute. Default for short prompts.
  - **Swap/offload**: move KV to **CPU RAM** (or disk/NVMe) and page it back.
    Saves recompute, costs PCIe bandwidth (offload ~tens of GB/s vs HBM ~TB/s).
    Better for long prompts where recompute is expensive.
- Continuous batching adds/removes sequences each step; preemption keeps the batch within the KV budget rather than OOM-crashing.

### Quantized KV cache (FP8 / INT8)
Store K/V at **1 byte/elem** instead of 2 → **~2× longer context or batch** in the
same VRAM. FP8 KV typically costs <1% quality; INT8 needs per-channel/per-token
scales to stay clean. (`--kv-cache-dtype fp8` in vLLM.)

### Sliding-window / streaming
Models with **sliding-window attention** (e.g. Mistral) attend only to the last W tokens, so KV is **bounded at W** — O(W) memory, not O(n). **StreamingLLM** keeps a few "attention-sink" initial tokens + a recent window to run effectively unbounded streams without OOM (dropping the true middle) — for long-running chats/logs where old context is expendable.

### KV reuse across requests
Persisting KV beyond one request (RadixAttention, vLLM prefix cache, or external
stores like LMCache offloading to CPU/disk) turns repeated prefixes into reads —
provider prompt caching implemented in your own serving layer when you self-host.

---

## 5. Memory pressure at scale

The core tradeoff on a fixed GPU:
```
VRAM ≈ weights + activations + KV(batch, context)     (KV is the variable term)
```
Since `KV ∝ batch · context`, you trade them against each other:

| Lever | Effect | Cost |
|-------|--------|------|
| ↑ batch size | ↑ throughput (tok/s aggregate) | ↑ KV → OOM risk, ↑ per-request latency |
| ↑ context length | longer prompts/outputs | ↑ KV per seq → fewer concurrent seqs |
| ↓ KV dtype (FP8) | ~2× capacity | small quality hit |
| ↓ num_kv_heads (GQA/MQA) | big KV cut | model-architecture decision |
| sliding window | bounded KV | loses long-range context |

**OOM** happens when active + cached KV exceeds the pool — usually triggered by a
burst of long-context requests, not steady state. Defend with: a hard
`max_num_seqs` / `max_num_batched_tokens` cap, `gpu_memory_utilization` headroom
(e.g. 0.90, not 0.98), admission control / queueing, and preemption (swap or
recompute) so the server degrades to higher latency instead of crashing.

**Capacity planning** (back-of-envelope):
```
kv_budget   = (VRAM · util) − weights − activation_overhead
max_tokens  = kv_budget / bytes_per_token        # from §3 formula
max_concurrent ≈ max_tokens / avg_seq_len
```
Plan for **p95 sequence length**, not mean — long tails are what OOM you. Leave
~10–15% headroom for activation spikes and fragmentation.

---

## 6. Cache safety & multi-tenancy

| Cache | Leakage vector | Isolation |
|-------|----------------|-----------|
| KV prefix sharing | Tenant B reads tenant A's reused prefix KV → **content/timing leak** | Namespace the cache key by tenant; don't share blocks across tenants for sensitive prefixes |
| Semantic cache | Cached response contains tenant A's PII, served to tenant B on a fuzzy match | **Per-tenant cache partition**; never cache PII-bearing responses |
| Provider prompt cache | Same-org reuse only (providers scope to API key/org); a cache *timing* side-channel can reveal "someone cached this prefix" | Treat presence of a hit as low-sensitivity; don't put secrets in shared system prompts |

Rules:
- **Partition every shared cache by tenant/user** when content is user-specific.
  A global prefix cache is safe *only* for genuinely shared content (the system
  prompt, public docs).
- **Never store secrets/PII in a shared prefix** that other tenants' requests
  could match against.
- Semantic caches must key on `(tenant_id, normalized_query)` and exclude any
  response embedding user data — or scope the vector index per tenant.

---

## 7. Failure modes (and the fix)

- **Unstable prefix → ~0% hit rate.** A UUID/timestamp/reordered-tool crept into
  the cached prefix. Symptom: cache_read_tokens collapse, input cost spikes.
  → Move all volatile content after the breakpoint; make tool/JSON order
  deterministic; diff two consecutive prompts byte-for-byte.
- **Semantic false hit → wrong answer served.** Threshold too low; negation or
  entity difference collapsed by the embedding. → Raise threshold, add a
  re-rank/verify gate, key on critical entities, exclude personalized intents.
- **Semantic staleness → confidently outdated answer.** Truth changed; cache
  didn't. → Version-tag + event-driven invalidation, not TTL alone.
- **KV OOM under long context.** A burst of long prompts exceeds the KV pool.
  → Cap max_num_seqs / batched_tokens, enable preemption (swap/recompute), FP8
  KV, lower gpu_memory_utilization, admission-queue.
- **Cross-tenant cache contamination.** Shared prefix/semantic cache leaks one
  tenant's data to another. → Partition keys by tenant; never cache PII in a
  shared namespace.
- **Cache thrash.** Working set > cache → constant evict/refetch, worse than no
  cache. → Size cache to the working set, pin hot prefixes, or shorten the prefix.
- **TTL expiry mid-loop.** A slow agent step lets the prefix expire → surprise
  cache-write surcharge. → Use the 1-hr TTL for long runs; hits refresh the TTL.

---

## 8. Do / Don't

**Do**
- Turn on provider prompt caching for every repeated-prefix workload — it's free
  correctness-wise and pays off after one reuse.
- Order prompts stable→volatile; put the cache breakpoint after the static block.
- Track cache hit rate as a first-class metric; alert on a sudden drop.
- Use FP8 KV + PagedAttention + prefix caching when self-hosting at scale.
- Partition shared caches by tenant; plan KV for p95 length with headroom.

**Don't**
- Don't inject timestamps/UUIDs/non-deterministic ordering into a cached prefix.
- Don't semantic-cache personalized, time-sensitive, or computational answers.
- Don't set the semantic threshold by feel — measure precision on labelled pairs.
- Don't run gpu_memory_utilization at 0.98 and expect no OOM under load.
- Don't share KV blocks or cached responses across tenants for sensitive content.
