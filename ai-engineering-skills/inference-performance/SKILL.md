---
name: inference-performance
description: Use when serving or optimizing LLM inference in production — diagnosing or improving TTFT/TPOT/throughput, choosing batching strategy, sizing GPUs, picking vLLM/TensorRT-LLM, or debugging low GPU utilization, TTFT spikes, and OOM. Covers prefill vs decode, the roofline, continuous batching, PagedAttention, chunked prefill, disaggregation, and FlashAttention.
tags: [ai-engineering, inference, latency, throughput, batching]
---

# LLM Inference Performance

Serving an autoregressive transformer is two workloads wearing one trench coat. **Prefill** processes the whole prompt at once; **decode** emits one token at a time. They have opposite bottlenecks, so a config tuned for one starves the other. Master this split and the rest (roofline, batching, paging) follows.

## The two phases

| | Prefill | Decode |
|---|---|---|
| Work | Process all `P` prompt tokens in parallel | Generate token `t` from tokens `0..t-1` |
| Matmul shape | `[P, d] × [d, d]` — tall, fat GEMM | `[1, d] × [d, d]` — GEMV per request |
| Bottleneck | **Compute (FLOPS)** | **Memory bandwidth (HBM)** |
| Passes per token | 1 (amortized over `P` tokens) | 1 full weight read **per token** |
| KV cache | **Writes** `P` tokens of K,V | **Reads** all prior K,V, appends 1 |
| Drives | **TTFT** (time to first token) | **TPOT/ITL** (time per output token) |
| Parallelism | Across the sequence (free) | Across the **batch** (must aggregate) |
| Scales with | Prompt length `P` (∝ FLOPs, ∝ P² attn) | Output length `O` (∝ steps) |

The asymmetry is the whole game. Prefill does ~`P` tokens of work in one weight-load, so it is **compute-bound** the moment `P` exceeds a few dozen. Decode loads **all model weights to produce one token**, so at batch 1 it is **brutally memory-bound** — the GPU's ALUs sit idle waiting on HBM. You fix them with different levers: prefill wants more FLOPS and work-splitting; decode wants more bandwidth and a bigger batch.

## Metrics that matter

- **TTFT** — time to first token. Prefill latency + queue wait. Dominated by prompt length and head-of-line blocking. The "feels responsive" metric.
- **TPOT / ITL** — time per output token / inter-token latency. The steady-state decode cadence. `1/TPOT` = per-stream tokens/s. The "reads smoothly" metric.
- **E2E latency** ≈ `TTFT + (O − 1) × TPOT` for `O` output tokens. Long generations are TPOT-dominated; short ones are TTFT-dominated.
- **Throughput** — system-wide `tokens/s` (decode) and `req/s`. The cost metric: $/token ∝ 1/throughput.
- **Goodput** — req/s **that meet their SLO** (e.g. TTFT < 500 ms AND TPOT < 50 ms). The honest number. Cranking batch size raises throughput while *lowering* goodput because per-request latency degrades — optimize goodput, not raw throughput.

> Rule: TTFT is a prefill problem, TPOT is a decode problem, throughput is a batching problem. Never debug them with one knob.

### How length drives each metric

The shape of a request — prompt length `P` and output length `O` — determines which metric dominates and which phase you pay for:

| Lever | TTFT | TPOT | E2E | Throughput | KV memory |
|---|---|---|---|---|---|
| ↑ prompt `P` | **↑↑** (∝ `P`, attn ∝ `P²`) | ~flat | ↑ | ↓ (prefill steals compute) | ↑ |
| ↑ output `O` | none | ~flat per token | **↑↑** (∝ `O`) | ↓ (long tail holds slot) | ↑ |
| ↑ batch `B` | ↑ (queueing) | ↑ (contention) | ↑ | **↑↑** | ↑ |

Two profiles need opposite tuning:
- **RAG / long-context** (`P` huge, `O` small): TTFT-dominated, prefill-bound. Fix with chunked prefill, prefix caching (RadixAttention), FP8 prefill, prefill-pool disaggregation. Batching barely helps — prefill is already compute-bound.
- **Agentic / long-generation** (`P` modest, `O` huge): TPOT- and E2E-dominated, decode-bound. Fix with bigger batch, KV quant, speculative decoding, higher-bandwidth GPU. A 2000-token generation at 42 ms/token = 84 s of pure decode — TPOT *is* the product.

## The roofline: why decode is bandwidth-bound

Arithmetic intensity (AI) = FLOPs performed ÷ bytes moved from HBM. Compare to the **ridge point** = peak compute ÷ peak bandwidth. Below the ridge → memory-bound; above → compute-bound.

| GPU | Dense BF16 | HBM BW | Ridge point (FLOPs/byte) |
|---|---|---|---|
| A100 80GB | 312 TFLOPS | 2.0 TB/s | **~156** |
| H100 SXM | ~989 TFLOPS | 3.35 TB/s | **~295** |
| H200 | ~989 TFLOPS | 4.8 TB/s | **~206** |

(Marketing "624/1979 TFLOPS" figures include 2:1 structured sparsity; use dense for serving math.)

For a model with `N` parameters, decode at batch `B`:
- FLOPs per step ≈ `2 · N · B` (one multiply-add per weight per sequence)
- Bytes loaded ≈ `2 · N` (weights read **once**, shared across the batch; BF16 = 2 B/param)
- **AI ≈ B** FLOPs/byte

So at **batch 1, AI ≈ 1** — three orders of magnitude under the ridge. Decode stays memory-bound until `B ≈ 150–300` (the ridge), which is *exactly why decode demands batching* and a high-bandwidth GPU. Prefill, by contrast, has `AI ≈ P` (every weight reused across `P` tokens), so it crosses the ridge at small prompt lengths and is compute-bound — which is why prefill scales with FLOPS and benefits from FP8/sparsity, while decode does not until batched.

Worked example — **same 70B model on one H100**, both phases:
- **Decode TPOT** (single stream) ≈ `2N / HBM_BW` = `140 GB / 3.35 TB/s` ≈ **42 ms/token** → ~24 tok/s. Bound by *bandwidth* (the 140 GB weight read), GPU compute idle.
- **Prefill TTFT**, 4k-token prompt ≈ `2·N·P / FLOPS` = `2·70e9·4096 / 989e12` ≈ **0.58 s**. Bound by *compute* (5.7e14 FLOPs), bandwidth slack.

One model, one GPU, two limits: prefill is compute-bound (AI ≈ `P` = 4096 ≫ ridge 295) and decode is bandwidth-bound (AI ≈ 1 ≪ 295). That single contrast is why you never tune them with one knob. Batching amortizes decode's weight read across `B` streams, so aggregate throughput climbs **near-linearly** in `B` until you hit the ridge or the KV-cache wall — but prefill, already compute-bound, gets *no* throughput lift from batching, only from FLOPS (FP8, sparsity, faster GPU).

If decode SM occupancy is low but HBM bandwidth is pegged, that is **correct** — you are bandwidth-bound; add batch, don't chase FLOPS.

## Continuous (in-flight) batching

Static batching groups `N` requests, runs them lockstep, releases all when the **slowest** finishes. Catastrophic for LLMs: output lengths vary 10–100×, so a batch of 8 where one request emits 2000 tokens and seven emit 50 keeps those seven slots **idle** for the whole tail. GPU util craters.

**Continuous batching** schedules at the **iteration (token) level**: every decode step the scheduler can evict finished sequences and admit waiting ones into freed slots. No request waits for the batch; new arrivals join mid-flight.

| | Static | Continuous |
|---|---|---|
| Scheduling unit | Whole request | One token step |
| Slot on completion | Idle until batch ends | Reused immediately |
| New request | Waits for next batch | Joins next iteration |
| GPU utilization | Low, sawtooth | High, sustained |

Effect: **~2–4× throughput** over static batching at equal latency in the common case. vLLM's headline "up to 23×" is vs. naive HuggingFace `generate()` — a real but generous baseline; quote 2–4× as the defensible number. This is the single highest-leverage serving change; it is the default in vLLM, TensorRT-LLM, and TGI. Originated as iteration-level scheduling in **Orca (OSDI '22)**.

## PagedAttention — the enabler

Continuous batching needs many concurrent KV caches; naive contiguous KV allocation reserves max-sequence-length per slot and wastes **60–80%** of KV memory (internal fragmentation + reservation). **PagedAttention** (vLLM) stores KV in fixed-size **blocks** (e.g. 16 tokens) with a block table per sequence — like OS virtual memory paging. Waste drops to **< 4%**, blocks are allocated on demand, and identical prefixes (system prompts, few-shot) are **shared copy-on-write** across requests.

More usable KV memory → larger batch → (see roofline) more throughput. PagedAttention is what makes continuous batching *fit in memory*. **KV-cache sizing, block management, eviction, and KV quantization live in the KV-cache skill — cross-ref it; the OOM sizing formula is reproduced below for convenience.**

> Related skills: **KV-cache** (the memory wall this skill keeps hitting), **speculative-decoding** (decode acceleration), **quantization** (bandwidth + memory relief). This skill is the *systems* view that ties them to TTFT/TPOT/throughput; each cross-ref skill is the *deep dive*.

## Chunked prefill and prefill/decode disaggregation

Two distinct techniques for the prefill-blocks-decode problem:

- **Chunked prefill** — split a long prefill into fixed token chunks (e.g. 512) and interleave each chunk with ongoing decode steps in the same batch. Stops a 32k-token prompt from monopolizing the GPU and freezing every active stream's TPOT. Smooths ITL, raises utilization (prefill fills decode's spare compute). Knob: chunk size trades TTFT (smaller = decode stays smooth, prefill slower) vs prefill speed.
- **Disaggregation** — run prefill and decode on **separate GPU pools** (separate processes/nodes), streaming the KV cache from prefill workers to decode workers. Because the phases are compute- vs bandwidth-bound, co-locating them forces one compromise config; splitting lets each pool be sized and tuned independently and eliminates prefill/decode interference entirely. Cost: KV-cache transfer over the interconnect. Used in DistServe, Mooncake, and production vLLM/TensorRT-LLM at scale.

Use chunked prefill first (one flag); reach for disaggregation when prefill/decode interference still violates SLOs at scale.

## FlashAttention — IO-aware attention

Standard attention materializes the `[N, N]` score matrix in HBM → `O(N²)` memory and HBM traffic; at long context this dominates and thrashes bandwidth. **FlashAttention** tiles Q/K/V into SRAM, fuses softmax, and **never writes the full matrix to HBM** (online softmax + recomputation in the backward pass).

- Memory: `O(N²)` → **`O(N)`**. HBM traffic: `O(N²)` → `O(N²/M)` for SRAM size `M` — a large constant-factor cut.
- Speed: **~2–4×** kernel speedup, exact (not an approximation). FA2 hits ~50–73% of A100 BF16 peak by improving work partitioning and reducing non-matmul FLOPs.
- **FA3** targets Hopper: asynchrony (warp-specialization, TMA) and FP8, pushing utilization substantially higher (hedge the exact PFLOPS by SKU/dtype).

Net: longer context at lower memory and bandwidth cost — directly relieves the decode bottleneck and enables larger batches. Default-on in every serious engine.

## Scaling big models and faster decode

- **Tensor parallelism (TP)** — shard each layer's matrices across GPUs; all-reduce per layer. Needed when weights + KV exceed one GPU. Bandwidth-hungry → keep **within a node** (NVLink). Cuts per-GPU weight bytes → lowers TPOT, but communication caps the win past TP=8.
- **Pipeline parallelism (PP)** — split layers into stages across GPUs/nodes. Cheaper interconnect, but **pipeline bubbles** hurt latency; better for throughput across nodes. Combine TP (intra-node) × PP (inter-node) for very large models.
- **Speculative decoding** — a cheap draft model proposes `k` tokens, the target verifies them in **one** forward pass; accepted tokens are free. **~2–3×** decode speedup, **output-distribution-lossless** via rejection sampling. Win is gated by the **draft acceptance rate** (and draft cost). Exploits decode's idle compute (memory-bound → spare FLOPs). **Cross-ref the speculative-decoding skill.**
- **Quantization** — weights to INT8/FP8/INT4 halves-or-quarters the bytes loaded per decode step → directly faster TPOT *because decode is bandwidth-bound*. KV-cache quant shrinks the memory wall → bigger batch. **Cross-ref the quantization skill** for accuracy tradeoffs.

## Serving engines

Don't hand-roll the scheduler — pick an engine that already does continuous batching + paged KV, then tune it. Differentiators (qualitative; cross-engine speed numbers are version- and workload-dependent — benchmark on *your* traffic, don't trust a blog's multiplier):

| Engine | Core technique | Strength | Friction |
|---|---|---|---|
| **vLLM** | PagedAttention | Easiest path, broadest model + HW support, fast-moving | Python overhead at extreme low-latency |
| **TensorRT-LLM** | Compiled engines, fused kernels | Top NVIDIA-only perf, FP8/INT4, in-flight batching | Build/compile step, per-model engine artifacts, setup friction |
| **SGLang** | **RadixAttention** | Automatic radix-tree **prefix caching** — wins on shared system prompts, few-shot, agentic/multi-turn | Newer, smaller ecosystem |
| **TGI** (HF) | Continuous batching | HF-native, production-hardened server, easy deploy | Fewer cutting-edge knobs |
| **LMDeploy** | TurboMind | Strong throughput, good quantization support | Smaller community |

**RadixAttention** (SGLang) deserves a name: it auto-detects and reuses **any** shared prefix across requests via a radix tree of KV blocks — strictly more general than static prefix caching, and the right default when many requests share a long system prompt or conversation history.

## Starting-config recipe

Concrete knobs for a single-GPU latency-SLO chat deployment (vLLM-style names; map to your engine):

- **Engine**: continuous batching ON (default), PagedAttention ON (default).
- `max_num_batched_tokens` — cap to bound worst-case TTFT (e.g. 8192). This is your prefill-burst limiter.
- **Chunked prefill** ON, chunk ≈ 512–1024 — keeps long prompts from freezing decode TPOT.
- `max_num_seqs` — set from the **KV formula**, not guesswork: largest batch whose `batch × max_context` KV fits in `GPU_mem − weights`. Start below the OOM ceiling, leave headroom.
- `gpu_memory_utilization` ≈ 0.90 — give KV cache room without OOM on activation spikes.
- **Tensor parallelism** only if weights+KV won't fit one GPU; keep `TP ≤ 8` and **intra-node** (NVLink).
- **Quantize** (FP8 weights/KV on Hopper) when bandwidth- or memory-bound — it directly improves TPOT and batch.
- Then **measure goodput** under real traffic and raise `max_num_seqs` until TTFT/TPOT SLO breaks; back off one step.

## The latency / throughput / cost frontier

Batch size is the master knob and it is a **direct tradeoff**:

| Batch ↑ | Throughput | TPOT (per-stream latency) | $/token | KV memory |
|---|---|---|---|---|
| effect | ↑ (until ridge/OOM) | ↑ (worse) | ↓ | ↑ |

You cannot maximize throughput and minimize latency at once — pick the operating point your SLO allows, then push batch to the largest value that still meets TTFT/TPOT (i.e. maximizes **goodput**). **Cost follows directly from throughput:**

```
$ / 1M tokens = GPU_$/hr ÷ (throughput_tok/s × 3600 / 1e6)
```

At ~$2/hr for an H100: 2,200 tok/s → **~$0.25/M tokens**; doubling throughput to 5,000 tok/s halves it to **~$0.11/M**. This is why batching is an economic lever, not just a latency knob — every extra concurrent stream that fits before the KV wall divides fixed GPU cost across more tokens. A latency-SLO that forces batch down doesn't just slow you; it *raises unit cost* proportionally. That tension — cheaper-but-slower (big batch) vs faster-but-pricier (small batch) — is the frontier you're actually choosing a point on. Practice:
- **SLO-based autoscaling** — scale replica count on *goodput* and queue depth, not GPU%. Decode GPUs can show modest SM% while perfectly bandwidth-saturated; CPU-style util metrics lie here.
- Set a **max batch / max num-batched-tokens** to bound worst-case TTFT and prevent KV OOM.
- Separate latency-SLO traffic (chat) from throughput traffic (batch/offline) onto different pools or priority classes.

## KV-cache memory: the OOM formula

```
KV bytes = batch × seq_len × 2(K,V) × n_layers × n_kv_heads × head_dim × dtype_bytes
```

`n_kv_heads` is where **GQA/MQA** shrink the cache (fewer KV heads than query heads). This product is your hard batch×context ceiling: total KV must fit in `GPU_mem − weights − activations`. Example — Llama-3-8B (32 layers, 8 KV heads, head_dim 128, BF16): per token = `2·32·8·128·2` ≈ **131 KB**; 8k context = ~1.07 GB **per sequence**. On an 80 GB GPU after ~16 GB weights, you fit ~50–60 such sequences before OOM — *that* is your real max batch, usually before the roofline ridge.

## Throughput vs batch in practice

Because decode loads weights **once per step regardless of batch**, aggregate decode throughput rises **near-linearly** with batch size — until one of two walls:

| Batch region | What limits you | Behavior |
|---|---|---|
| `B` small (1–8) | Bandwidth (weight load) | Per-stream TPOT ~flat; aggregate tok/s ≈ linear in `B` |
| `B` mid | Still bandwidth, KV growing | Throughput climbs; KV memory creeps up |
| `B` near ridge (~150–300) | Compute | Throughput flattens — you've crossed into compute-bound |
| `B` past KV wall | **HBM capacity** | OOM, or scheduler throttles new requests |

For most real models the **KV wall hits first**: the Llama-3-8B example above caps at ~50–60 concurrent 8k sequences — well below the A100 ridge of ~156. So your max batch is almost always set by `GPU_mem`, not by the roofline. Levers to push the wall out (and the batch up): **PagedAttention** (recover 60–80% wasted KV), **GQA/MQA** (fewer KV heads), **KV-cache quantization** (FP8/INT8 KV halves bytes), and shorter `max_context`. Each one directly raises the achievable batch → throughput.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Low GPU util, sawtooth throughput | Static batching — slots idle for the slow tail | Continuous batching (vLLM/TRT-LLM/TGI) |
| TTFT spikes under load | Long prompt's prefill blocks all decode (head-of-line) | Chunked prefill; cap prompt len; prefill/decode disaggregation |
| OOM after a while at high concurrency | `batch × context` KV exceeds HBM | PagedAttention; cap max-batched-tokens; GQA; KV quant; shorter max-context |
| Decode "slow" but SMs idle, BW pegged | Memory-bound by design at low batch | Increase batch; quantize weights; higher-BW GPU — **not** more FLOPS |
| Throughput great, p99 latency awful | Batch too large for the latency SLO | Optimize **goodput**; lower max batch; split latency vs throughput pools |
| TP scaling stalls past 8 GPUs | All-reduce comm dominates | Keep TP intra-node (NVLink); add PP across nodes |
| Prefix-heavy workload, redundant compute | No prefix reuse | Prefix/KV caching (PagedAttention CoW shared blocks) |

## Scheduling and admission control

The scheduler decides, each iteration, which waiting requests to admit and which running ones to continue or **preempt**. This is where TTFT and fairness are won or lost:

- **Admission** — a new request only starts prefill when enough KV blocks are free. Under memory pressure the scheduler queues it (raising TTFT) rather than OOM. Cap `max_num_batched_tokens` so a burst of long prompts can't starve decode.
- **Preemption / recompute vs swap** — when KV runs out mid-generation, the engine evicts a running sequence: either **recompute** its KV on resume (cheap memory, costs compute) or **swap** KV to host RAM (costs PCIe bandwidth). Both add latency spikes — visible as TPOT jitter. Fewer preemptions = lower `gpu_memory_utilization` headroom traded for stability.
- **Priority / fairness** — without it, long generations hog slots and short interactive requests starve (head-of-line blocking at the request level). Use priority classes or a fairness policy to protect interactive p99.
- **Prefix-cache-aware routing** — in a multi-replica fleet, route requests sharing a prefix to the **same** replica so RadixAttention/PagedAttention prefix reuse actually hits. Naive round-robin throws the cache away.

## Measuring it honestly

You cannot tune what you measure wrong. Rules for a credible benchmark:

- **Report percentiles, not means** — p50/p95/p99 of TTFT and TPOT. Means hide the tail that breaks SLOs; the tail is the product for users.
- **Match the benchmark's input/output distribution to production.** A fixed 128-in/128-out synthetic load tells you nothing about a RAG service with 6k-token prompts. Replay real traffic shapes (prompt-length and output-length histograms) — they determine prefill/decode mix.
- **Sweep request rate (req/s) and plot the goodput curve.** Goodput rises with load, then *collapses* past the saturation point as queueing blows TTFT. The knee is your real capacity per replica — size autoscaling to it.
- **Separate cold from warm.** First requests pay model-load and CUDA-graph capture; exclude warmup from steady-state numbers.
- **Distinguish open- vs closed-loop load.** Closed-loop (fixed concurrency) and open-loop (fixed arrival rate) give different latencies under saturation — production is open-loop; benchmark it that way.
- **Tooling**: vLLM `benchmark_serving`, GenAI-Perf / NVIDIA Triton perf tools, or `llmperf`. Log per-request TTFT, TPOT, and SLO-attainment to derive goodput directly.
- **Watch the right counter**: for decode, HBM **bandwidth utilization** is the truth, not SM%. Low SM% with pegged bandwidth = healthy bandwidth-bound decode, not an idle GPU.

## Do / Don't

- **Do** profile TTFT and TPOT separately — they have different bottlenecks and different fixes.
- **Do** treat continuous batching + PagedAttention as table stakes; reach for a real engine (vLLM, TensorRT-LLM, SGLang, TGI) before hand-rolling.
- **Do** size max batch from the **KV formula and your latency SLO**, not from GPU% or the roofline ridge — KV memory usually binds first.
- **Do** quantize weights/KV to speed decode — it is bandwidth-bound, so fewer bytes = faster directly.
- **Don't** chase decode GPU utilization with more FLOPS; at low batch you are bandwidth-bound and util *should* be low.
- **Don't** use static batching in production — it wastes the GPU on output-length variance.
- **Don't** let one long prompt block the decode loop; chunk prefill or disaggregate.
- **Don't** report raw throughput as success if p99 latency blew the SLO — report **goodput**.
- **Don't** stretch tensor parallelism across nodes; the interconnect kills it.

## Mental model

Prefill is a sprint (compute), decode is a marathon (bandwidth). Batching amortizes decode's weight-load across runners; PagedAttention is the track that fits more runners; continuous batching keeps every lane full; chunked prefill stops the sprinter from tripping the marathoners. Tune for goodput at your SLO, and let the roofline tell you which resource you are actually short on before you spend on the wrong one.
