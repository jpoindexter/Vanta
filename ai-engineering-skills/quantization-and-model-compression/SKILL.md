---
name: quantization-and-model-compression
description: Reference-grade guide to shrinking and speeding up LLMs without retraining from scratch — numeric formats (FP8/INT8/INT4), PTQ methods (GPTQ, AWQ, SmoothQuant, bitsandbytes NF4, GGUF k-quants), KV-cache quantization, speculative decoding (Medusa/EAGLE/n-gram), and distillation — with concrete numbers, when each fits, and the quality cliffs.
tags: [ai-engineering, quantization, distillation, speculative-decoding]
---
# Quantization & Model Compression

Compression is how a model that *trained* on a cluster *serves* on the GPU you can afford. Three orthogonal tools attack three different costs: **quantization** cuts memory/cost (maybe lossy), **speculative decoding** cuts decode latency (lossless), **distillation** produces a genuinely smaller model (training cost up front). Pick by the bottleneck, not by hype. They compose.

## 1. Why compress

- **Memory fit.** A 70B model in FP16 weights = ~140 GB — won't fit one 80 GB H100. At INT4 it's ~35 GB and fits with room for KV cache. Quantization is often the *only* way onto one GPU.
- **Cost.** Fewer/smaller GPUs per replica; higher batch density. Half the bytes per weight ≈ half the VRAM ≈ roughly half the $/token at fixed throughput.
- **Latency.** LLM decode is **memory-bandwidth bound**, not compute bound — every token streams all weights from HBM. Halving weight bytes ~halves the per-token read, so INT4/INT8 decode is faster even when the math is the same. Speculative decoding attacks the *same* bottleneck by verifying many tokens per forward pass.
- **Throughput / batch.** Smaller weights + smaller KV cache leave headroom for larger batches, which is where serving economics live.

> Rule: prefill is compute-bound (FLOPs), decode is bandwidth-bound (byte reads). Quantization helps decode most; it does little for prefill-heavy/long-prompt workloads.

## 2. Numeric formats

| Format | Bits | Range driver | Precision | Mem vs FP16 | Hardware | Notes |
|--------|------|--------------|-----------|-------------|----------|-------|
| **FP32** | 32 | 8 exp | 23 mantissa | 2× | universal | training/reference baseline |
| **FP16** | 16 | 5 exp | 10 mantissa | 1× | all modern GPU | narrow range — can overflow in training |
| **BF16** | 16 | 8 exp | 7 mantissa | 1× | A100+/TPU | FP32 range, less precision — **default training dtype** |
| **FP8 E4M3** | 8 | 4 exp | 3 mantissa | 0.5× | H100/Ada, MI300 | more precision, less range — **weights/activations**; ~lossless inference |
| **FP8 E5M2** | 8 | 5 exp | 2 mantissa | 0.5× | H100/Ada | more range, less precision — gradients/error-tolerant |
| **INT8** | 8 | scale/zero-point | uniform | 0.5× | universal (DP4A/tensor) | classic W8A8; needs outlier handling |
| **INT4** | 4 | scale/zero-point | uniform | 0.25× | via dequant kernels | weight-only sweet spot; quality risk on small models |

Key contrasts:
- **Float (FP8) vs integer (INT8):** floats put precision near zero where weights cluster, so FP8 tolerates outliers far better than INT8. On H100, FP8 inference is frequently **near-lossless** with almost no calibration — the easiest big win if you have the hardware.
- **BF16 vs FP16:** same bytes, but BF16 trades mantissa for exponent range. Train in BF16 (no loss scaling needed); FP16 still fine for inference.
- **INT4 isn't "half of INT8" in quality** — error roughly doubles per bit dropped and the cliff is nonlinear (see §6).
- **E4M3 vs E5M2:** E4M3 (range ±448) is the *forward* dtype (weights, activations) — more mantissa = better signal. E5M2 (range ~±57344) matches FP16's exponent and is for gradients/anything that can spike. Hopper tensor cores run both natively.

Hardware reality check:
- **FP8 tensor cores** exist only on Hopper (H100/H200), Ada (L4/L40S), and AMD MI300. Pre-Ampere has no FP8 — there, FP8 is software-emulated and *slower*, so don't.
- **INT8 (DP4A / INT8 tensor cores)** is near-universal (Turing onward) — the portable activation-quant target.
- **INT4** has no native matmul on most GPUs; kernels **dequantize INT4→FP16 on the fly** (e.g. Marlin, ExLlama). The win is memory-bandwidth (fewer bytes read), not raw INT4 math. A bad dequant kernel can erase the speedup — kernel choice matters as much as the format.

### Granularity, symmetry, what gets quantized
- **Weight-only (W4/W8A16):** quantize weights, keep activations FP16. Dominant for LLM *serving* — activations carry the nasty outliers, so leaving them in FP16 sidesteps the hardest problem. GPTQ, AWQ, bitsandbytes, GGUF are all weight-only.
- **Weight + activation (W8A8):** quantize both → INT8 matmuls, ~2× compute throughput, but you must tame activation outliers first (that's SmoothQuant's whole job).
- **Per-tensor** — one scale for the whole tensor. Fast, lossy; outliers dominate the scale.
- **Per-channel** — one scale per output channel. Standard for weights.
- **Per-group** — one scale per block of N weights (typically **group_size=128**). Best quality/size trade for INT4; the de-facto default.
- **Symmetric** (zero-point=0, range `[-a,a]`) — cheaper kernels, default for weights. **Asymmetric** (learned zero-point) — better for skewed/non-centered activations.

> Smaller group size = better accuracy, more scale metadata. group=128 ≈ +0.5–1% size for most of the quality. group=32 for fragile models; per-tensor only when kernels demand it.

### The integer-quant math (what a scale/zero-point actually is)
```
# asymmetric INT-n, real value r → quantized q
scale      = (r_max - r_min) / (2^n - 1)        # bucket width
zero_point = round(-r_min / scale)              # integer mapping of 0.0
q          = clamp(round(r / scale) + zero_point, 0, 2^n - 1)
r̂          = (q - zero_point) * scale           # dequantized (lossy)
```
Symmetric drops the zero-point (`r_min = -r_max`, zp=0) → cheaper kernels. The stored overhead per quantized block is just `{scale, zero_point}` — that's why group_size trades size for accuracy. INT4 weight-only "memory" = 4 bits/weight **plus** scales: at group=128 that's ~4.25 effective bits/weight, not a clean 4.

### Worked memory budget — Llama-3 70B
| Component | FP16 | INT8 W8A16 | INT4 W4A16 g128 |
|-----------|------|------------|-----------------|
| Weights (70B params) | ~140 GB | ~70 GB | ~37 GB |
| KV cache @ 8k ctx, bs=16 (FP16) | ~40 GB | ~40 GB | ~40 GB |
| **Total** | **fails on 1×80 GB** | fits, tight | **fits with room** |
| + FP8 KV cache | — | ~50 GB | ~57 GB |

Takeaway: INT4 weights are what *fit* a 70B on one H100; KV-cache quant is what lets you then grow batch/context. Quantizing weights alone won't save you if a long-context KV cache is the real wall.

## 3. PTQ vs QAT

| | **PTQ** (post-training) | **QAT** (quant-aware training) |
|---|---|---|
| Cost | minutes–hours, a few hundred calibration samples | full/partial retrain, days of GPU |
| Data | small calibration set | full training pipeline + labels |
| Quality at INT4 | good (AWQ/GPTQ) | best, recovers most of the cliff |
| When | **default — start here** | only after PTQ proves insufficient and accuracy is worth a retrain |

For LLMs, **PTQ is the norm** — QAT a 70B model is rarely worth it. QAT earns its cost for sub-4-bit, edge deployment, or when a specific eval must not regress.

## 4. The PTQ methods that matter

### GPTQ — second-order, layer-wise
Quantizes weights one layer at a time, using approximate **second-order (Hessian) information** from a calibration set to choose rounding that minimizes output error, compensating remaining columns as it goes. Strong **4-bit weight-only**; 3-bit possible with degradation.
- Use when: you want max accuracy at W4A16 and can spend calibration time (slower to produce than AWQ).
- Watch: overfits the calibration distribution — use representative data; one-shot, no backprop.

### AWQ — Activation-aware Weight Quantization
Insight: not all weights matter equally. The ~**0.1–1%** of weight channels that multiply large-magnitude activations are *salient* — quantizing them dumbly destroys quality. AWQ measures activation magnitude, then **per-channel scales** weights to protect the salient ones (no mixed precision needed). Excellent W4A16, robust on instruction-tuned models, fast calibration.
- Use when: 4-bit weight-only serving — often the **default** today (vLLM/TGI first-class, great quality/speed).
- Watch: still needs a calibration set matching the deployment domain.

### SmoothQuant — migrate outliers for W8A8
Activation outliers (a few channels 10–100× larger) break INT8 activation quantization. SmoothQuant **mathematically migrates** the difficulty from activations into weights via a per-channel smoothing factor `s` (offline, equivalence-preserving: `(X·diag(1/s))·(diag(s)·W)`), so *both* go INT8 cleanly. Enables true **W8A8** INT8 matmuls (compute speedup, not just memory).
- Use when: you want INT8 *activations* for throughput on INT8 tensor cores, not just weight-only memory savings.
- Watch: tune the migration strength `α` (≈0.5); it pairs with, not replaces, weight quantization.

### bitsandbytes — NF4 / QLoRA, 8-bit
- **LLM.int8()** — W8A16 with an outlier-aware mixed-precision matmul (outlier columns kept FP16). Zero-calibration drop-in load (`load_in_8bit`), but slower kernels than AWQ/GPTQ.
- **NF4 (4-bit NormalFloat)** — an information-theoretically optimal 4-bit dtype for normally-distributed weights; the backbone of **QLoRA**: load a frozen 4-bit base and train small FP16 LoRA adapters on top. The standard way to **fine-tune a 70B on a single 48 GB GPU**.
- Use when: fast prototyping, fine-tuning under VRAM limits. For raw serving throughput, AWQ/GPTQ kernels usually beat bnb.

### GGUF / llama.cpp — k-quants for CPU/edge/Mac
GGUF is the container; **k-quants** (`Q4_K_M`, `Q5_K_M`, `Q6_K`, `Q8_0`, `Q2_K`…) mix bit-widths across tensor types and use per-block scales. `_K_M` ≈ medium, the popular balance. Runs CPU + Apple Metal + partial GPU offload.
- Use when: local/Mac/CPU inference, Ollama, no datacenter GPU.
- Picking: **Q4_K_M** is the standard "good enough" default; Q5/Q6 if you have RAM and want headroom; **avoid Q2_K / Q3** except on huge models where there's redundancy to spare.

### Quick chooser
| Goal | Pick |
|------|------|
| H100/Ada, near-lossless, minimal effort | **FP8** |
| GPU serving, 4-bit, best quality | **AWQ** (or GPTQ) |
| INT8 activations for compute throughput | **SmoothQuant (W8A8)** |
| Fine-tune big model on small VRAM | **QLoRA / NF4 (bnb)** |
| Mac / CPU / local | **GGUF Q4_K_M** |

## 5. KV-cache quantization

The KV cache grows with batch × sequence length and at long context **dwarfs the weights** — it, not weights, becomes the memory and bandwidth wall. Quantize K and V tensors to **FP8 or INT8** (→ ~2× cache shrink, ~2× longer context or batch). FP8 KV is typically near-lossless and is the safe default on H100; INT8 KV usually needs per-token/per-channel scales. Cross-ref the KV-cache / attention skill for paged-attention and cache-sizing math.
- Watch: the **V** tensor and very long contexts are most sensitive; quantize K first, keep an eval on long-context retrieval.

## 6. When quantization HURTS quality

The failure is rarely uniform — it concentrates.

- **Activation outliers.** Emergent in models >~6.7B: a few feature dimensions with huge magnitudes. Per-tensor INT8 lets them dominate the scale and crush everything else → garbage. Fixes: keep activations FP16 (weight-only), or SmoothQuant, or mixed-precision (LLM.int8()).
- **INT4 on small models.** <~3B params have little redundancy to absorb error; INT4 can cost several points of accuracy. **The smaller the model, the more it bleeds** — prefer INT8 or FP8 for small models.
- **Long-context degradation.** Quantized KV + quantized weights compound over thousands of tokens; retrieval/needle tasks regress before short-prompt evals notice.
- **Reasoning & code are more sensitive** than chat. Multi-step math, long code generation, and tool-call argument formatting amplify small per-token errors into wrong final answers. Always include a coding + reasoning eval, not just perplexity.
- **Error accumulation.** Per-layer error compounds through depth; autoregression compounds it again across tokens. A 0.3% per-layer error is invisible on layer 1 and fatal by layer 60 on a 200-token generation.
- **The quality cliff.** Quality is flat from FP16→INT8→ often INT4, then **falls off a cliff** at 3-bit / 2-bit. Bits-per-weight is the lever; the cliff location depends on model size and method.

Rough quality vs bits (weight-only, good method like AWQ; deltas widen on small/reasoning models):
| Precision | Typical quality vs FP16 | When safe |
|-----------|------------------------|-----------|
| FP8 / INT8 | ~lossless (<0.5%) | almost always |
| INT4 g128 | ~0.5–2% drop | ≥7B, non-reasoning-critical |
| INT3 | several % | large models only |
| INT2 (Q2_K) | large / unstable | 70B+ where redundancy survives |

### Measuring — perplexity is weak
- **Perplexity is necessary, not sufficient.** It can move <1% while task accuracy craters — it averages over tokens and hides reasoning/format failures.
- **Use task evals** matching deployment: MMLU/ARC (knowledge), GSM8K/MATH (reasoning), HumanEval/MBPP (code), plus a domain set and long-context needle test.
- **A/B against the FP16 baseline** on *your* traffic. Watch tool-call JSON validity and instruction-following — quant breaks these before it breaks fluency.
- Set a regression budget *before* quantizing (e.g. "≤1% MMLU, 0 broken tool calls") and gate on it.

## 7. Speculative decoding — lossless latency

A small **draft** model proposes the next *k* tokens; the **target** model verifies all *k* in **one parallel forward pass**. Accepted tokens are kept; the first rejection resamples from the target. The output distribution is **provably identical to the target alone** — *lossless*, pure speedup. Typical **2–3× decode speedup** (more on easy/predictable text). It trades extra FLOPs (cheap, prefill-style parallel) for fewer sequential memory-bound steps.

| Variant | Drafter | Notes |
|---------|---------|-------|
| **Two-model** | separate small model (same tokenizer/family) | classic; needs a good aligned draft model |
| **Self-speculative** | the target's own early layers / skipped layers | no extra model to ship |
| **Medusa** | extra decoding "heads" on the target predict multiple future tokens | tree-attention verify; no separate model, light training |
| **EAGLE / EAGLE-2/3** | lightweight head predicting at the **feature** level + tree drafting | **highest acceptance** of the head-based methods; SOTA speedup |
| **n-gram / prompt lookup** | copies likely continuations from the prompt/context | zero model, zero training; great for **summarization/RAG/code-edit** where output echoes input |

- **Acceptance rate** is everything. Speedup ≈ accepted-tokens-per-verify. High when draft≈target (same family, in-distribution); low on creative/high-entropy text.
- **Draft sizing.** The draft must be **much cheaper** than the target — rule of thumb ~10–20× smaller (e.g. a 7B drafting for a 70B, or a 1B for a 13B). Too large a draft and its cost eats the savings even at high acceptance; too small and acceptance drops. The draft *must share the target's tokenizer* (or use a translation layer).
- **The arithmetic.** With acceptance `α` and `k` proposed tokens, expected accepted ≈ `(1-α^(k+1))/(1-α)`. At α=0.8, k=5 → ~3.4 tokens/verify ≈ ~3× fewer target passes. At α=0.4 the same k yields ~1.6 — barely above 1, and after draft overhead you can net *negative*.
- **Helps:** low-batch / latency-sensitive serving, predictable or input-echoing output (RAG, summarization, code edits), strong draft alignment.
- **Hurts:** **low acceptance makes it slower** — you pay draft cost + a wasted verify per reject. Also near-useless at **high batch sizes**, where the target is already compute-saturated and there's no idle bandwidth to reclaim. Greedy/low-temp decoding accepts more than high-temperature sampling.

## 8. Distillation — a different axis

Train a small **student** to mimic a large **teacher** — match teacher *soft logits/distributions* (richer signal than hard labels), optionally intermediate features. The result is a permanently smaller, faster, cheaper architecture (e.g. DistilBERT ~40% smaller/~60% faster at ~97% quality; modern LLM "distilled" variants train a small model on a frontier model's outputs).
What signal you match:
- **Response (logit) distillation** — KL-divergence between student and teacher output distributions, usually at **temperature T>1** to soften logits and expose the teacher's "dark knowledge" (relative probabilities of wrong answers). Loss ≈ `α·KL(soft) + (1-α)·CE(hard labels)`. The default for LLMs.
- **Feature distillation** — match intermediate hidden states / attention maps. More signal, but needs architectural alignment (or a projector). Used by DistilBERT-style work.
- **On-policy / sequence-level (modern LLM distillation)** — student generates, teacher scores/corrects its *own* trajectories. Avoids the exposure-bias mismatch of pure offline logit matching and is how today's small "distilled from a frontier model" chat models are built.

Properties:
- **Task-specific distillation** beats general: a small student matching the teacher on *your* domain often rivals the teacher there while being a fraction of the size.
- Costs real training compute and a teacher (or its outputs); risks **overfitting a narrow distribution** — strong on the distilled task, brittle off it.
- Distillation changes the *model*; quantization changes its *representation*. Orthogonal — you can distill **then** quantize the student.
- Watch the **license** on synthetic teacher outputs — many frontier-model ToS forbid training competing models on their generations.

## 9. Picking the tool — and combining

| Tool | Cuts | Lossless? | Up-front cost | Changes |
|------|------|-----------|---------------|---------|
| **Quantization** | memory, $/token, decode latency | usually slightly lossy | minutes (PTQ) | representation |
| **Speculative decoding** | decode latency only | **yes** | a draft model/heads | nothing (same output) |
| **Distillation** | size, latency, $ | no (new model) | training run | the model itself |

- **Memory-bound / can't fit?** → quantize (AWQ/GPTQ/FP8) + KV-cache quant.
- **Latency-bound, batch small, quality untouchable?** → speculative decoding.
- **Want a structurally smaller model for a known task?** → distill.
- **Combine:** distill → quantize the student → serve with speculative decoding (the quantized student can even *be* the draft model). Stack memory + latency + size wins.

## 10. Failure modes — quick reference

- **INT4 quality cliff** — small or reasoning-heavy model + 4-bit → multi-point drop. Mitigate: AWQ/GPTQ + group=128, or step up to INT8/FP8 for models <~7B.
- **2/3-bit collapse** — below INT4, output degrades fast except on very large redundant models. Reserve Q2_K for 70B+ only.
- **Activation-outlier blowup** — naive per-tensor W8A8 → gibberish. Use SmoothQuant or weight-only.
- **Calibration overfit** — GPTQ/AWQ tuned on mismatched data underperform in production. Calibrate on representative traffic.
- **Speculative decoding slower than baseline** — low acceptance (misaligned draft, high-entropy output) or high batch. Verify acceptance rate >~0.6 before shipping; disable at high batch.
- **Distillation overfits narrow** — student aces the distilled task, fails adjacent ones. Distill on a broad-enough distribution or scope deployment to match.
- **Perplexity-only validation** — ships a model that reads fine but fails tool calls / math. Always run task + format evals against the FP16 baseline.

## 11. Tooling & recipes

**Quantize for GPU serving (AWQ, 4-bit):** `autoawq` produces the checkpoint; serve directly in **vLLM** (`--quantization awq`) or **TGI**. Calibrate on ~128–512 samples of representative traffic; group_size=128.
```python
# AWQ quantize, then load — illustrative
from awq import AutoAWQForCausalLM
m = AutoAWQForCausalLM.from_pretrained("meta-llama/Llama-3-70B-Instruct")
m.quantize(tokenizer, quant_config={"w_bit": 4, "q_group_size": 128, "version": "GEMM"})
m.save_quantized("llama3-70b-awq")
# serve: vllm serve llama3-70b-awq --quantization awq --kv-cache-dtype fp8
```
**FP8 (H100/Ada):** simplest path — vLLM `--quantization fp8` or NVIDIA **TensorRT-LLM** / Modelopt; near-lossless, minimal calibration.
**QLoRA fine-tune:** `transformers` + `bitsandbytes` `BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=bf16)` + `peft` LoRA adapters.
**Local/Mac:** `llama.cpp` `convert_hf_to_gguf.py` → `quantize model.gguf model-Q4_K_M.gguf Q4_K_M`, or pull a pre-quantized GGUF in **Ollama / LM Studio**.
**Speculative decoding:** vLLM `--speculative-model <draft>` (two-model), or `--speculative-model [ngram]` for prompt-lookup, or ship EAGLE/Medusa heads where the engine supports them.

**Decision flow:**
1. On H100/Ada? → try **FP8** first (lowest effort, near-lossless). Done if it passes evals.
2. Need to fit / cut cost further? → **AWQ/GPTQ W4A16 g128** + **FP8 KV cache**.
3. Want INT8 *activation* throughput? → **SmoothQuant W8A8**.
4. Latency-bound at low batch, quality fixed? → add **speculative decoding** (check acceptance >0.6).
5. Fine-tuning under VRAM limits? → **QLoRA/NF4**.
6. Need a structurally smaller model for a known task? → **distill**, then quantize the student.
7. Gate every step on a **task-eval regression budget** vs the FP16 baseline.

## Do / Don't

**Do**
- Start at FP8 (if H100/Ada) or INT8 — only drop to INT4 when memory forces it.
- Use AWQ or GPTQ with **group_size=128** for 4-bit weight-only serving.
- Quantize the KV cache (FP8) before quantizing weights harder, at long context.
- Validate with **task + format evals** and a regression budget set beforehand.
- Combine tools: distill → quantize → speculative-decode for stacked wins.

**Don't**
- Don't INT4 a <3B model and expect FP16 quality.
- Don't quantize activations per-tensor without taming outliers (SmoothQuant first).
- Don't trust perplexity alone, or evals on data unlike production.
- Don't ship speculative decoding without checking the acceptance rate, or at high batch.
- Don't reach for QAT before PTQ has demonstrably failed.
