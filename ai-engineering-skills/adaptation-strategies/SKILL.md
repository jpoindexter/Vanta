---
name: adaptation-strategies
description: Decision framework for making a model do a task — choosing between in-context learning, RAG, fine-tuning (LoRA/QLoRA/DPO), and distillation. Maps the gap you have (knowledge / behavior / capability / cost) to the right lever, names when each is the WRONG tool, and covers data requirements, eval, catastrophic forgetting, and combining methods.
tags: [ai-engineering, fine-tuning, rag, in-context-learning, distillation]
---
# Adaptation Strategies — Fine-tune vs ICL vs RAG vs Distillation

You have a base model. It doesn't do the task well enough. You have four levers to change that, and they are **not interchangeable** — each changes a different thing. Picking the wrong one is the most expensive recoverable mistake in applied AI: weeks of labeling, a training run, and an eval suite, all to solve a problem a 200-token prompt would have fixed.

The whole discipline reduces to one question: **what kind of gap do you have?**

| Gap | Symptom | Right lever |
|-----|---------|-------------|
| **Knowledge** | Model doesn't *know* a fact, doc, or current state | **RAG** |
| **Behavior / format** | Model knows enough but won't reliably *do it the way you need* (tone, structure, JSON, domain register) | **Fine-tune** (after prompt+RAG exhausted) |
| **Capability** | Model literally *can't* — reasoning depth, hard task it fails at any prompt | **Bigger model**, then **ICL** to steer it |
| **Cost / latency at scale** | Quality is fine, the bill or the p95 isn't | **Distill** or **fine-tune a small model** |

Memorize that table. Everything below is detail on each lever and the failure modes of using one in the wrong row.

---

## 1. The four levers — what each actually changes

### In-context learning (ICL)
Prompt engineering, few-shot examples, instructions, in-prompt context. **Changes behavior at inference time only — zero weight updates.**

- **Mechanism:** the model conditions on tokens you supply. No training, no artifact, nothing persisted.
- **Iteration speed:** instant. Edit a string, rerun. This is its superpower — you can try 50 variants in an hour.
- **Cost shape:** pay in tokens on *every single call*, forever. A 2,000-token few-shot block on 10M calls/month is a real line item.
- **Ceiling:** bounded by context window and by the fact that long prompts dilute attention and raise latency. Few-shot helps format and style enormously; it does *not* reliably add deep capability the base model lacks.
- **Reach for it:** always first. Every other lever should be benchmarked *against a seriously-tried prompt*, not a lazy one.

### RAG (retrieval-augmented generation)
Retrieve relevant chunks from a knowledge source and inject them into the prompt. **For KNOWLEDGE, freshness, and attribution — not for behavior.** (Full retrieval/chunking/eval detail lives in the **`rag` skill**; here we only place it among the levers.)

- **Mechanism:** index → retrieve → stuff into context → generate. Weights untouched.
- **What it fixes:** "the model doesn't know our docs / today's prices / this customer's history," and "I need a citation for every claim."
- **What it does NOT fix:** how the model writes, formats, or reasons. Retrieving better text does not change tone or output structure.
- **Freshness:** update the index, not the model. This is why current/changing facts belong in RAG, never in weights.

### Fine-tuning
Update the model's weights on task data. **For BEHAVIOR, format, style, domain register, and latency-by-shrinking-the-prompt.** Variants:

| Variant | What it does | When |
|---------|--------------|------|
| **Full SFT** | Updates all weights | Rare now; large data + budget + ops, max control |
| **LoRA** | Trains small low-rank adapter matrices, freezes base | Default for behavior/format adaptation |
| **QLoRA** | LoRA on a 4-bit-quantized base | LoRA when VRAM-constrained (fine-tune a 70B on one big GPU) |
| **DPO / preference tuning** | Aligns to *preferred vs rejected* pairs, no reward model | Shape *judgment* — "prefer concise," "refuse X" — not just imitate |

- **Mechanism:** gradient descent bakes the pattern into weights. The behavior becomes free at inference (no prompt tokens spent on it).
- **What it's *great* at:** consistent output format, house style/tone, terse domain register, classification, function-calling shape, **and shrinking a giant prompt into the weights** so each call is cheaper/faster.
- **What it's *bad* at:** reliably injecting facts (see §3), and anything you haven't built an eval for.
- **Cost shape:** pay once to train (+ retrains on drift), cheap per call. The inverse of ICL.

### Capability gap — the lever nobody wants to hear
A **capability gap** is when the base model *can't do the task at any prompt* — the reasoning is too deep, the chain too long, the judgment too hard. This is the one row where adaptation can't save you.

- **Fine-tuning does not add capability.** It moves *format/behavior*, not the reasoning ceiling. You can fine-tune a model to *look* confident on a task it fundamentally can't do — that's how you get fluent, well-formatted wrong answers.
- **RAG does not add capability.** It moves *knowledge into context*; it doesn't make the model reason better over that context.
- **The only real fixes:** a **bigger/stronger base model**, or **ICL that decomposes the task** — chain-of-thought, step-by-step, breaking one hard call into several easy ones. CoT/decomposition is *steering* the capability the model already has into reach; it is not *adding* capability. If decomposition + the strongest model still fails, the task is out of reach and no adaptation lever changes that.

### Distillation
Train a **small** model on a **big** model's outputs for a **specific** task. **For cost/latency at a fixed quality bar on a narrow task.**

- **Mechanism:** generate a dataset with the teacher (or use its logits/rationales), fine-tune the student on it. The student learns *the task*, not the teacher's whole generality.
- **What it buys:** 10–50× cheaper/faster inference at near-teacher quality — *on that one task*. The student does not inherit the teacher's broad ability.
- **Precondition:** a **stable, well-defined task** and an eval that proves the student matches the teacher where it counts. No stable task → nothing to distill *to*.

---

## 2. The decision — gap → lever

```
                          ┌─────────────────────────────────────┐
                          │  Start: model underperforms on task  │
                          └──────────────────┬──────────────────┘
                                             ▼
                 ┌───────────────────────────────────────────────┐
                 │ Have you SERIOUSLY tried prompt + few-shot?    │
                 └───────────────┬───────────────────────┬───────┘
                              no │                    yes │
                                 ▼                        ▼
                    Do that first. Cheapest    ┌──────────────────────────┐
                    fix, instant iteration.    │ What kind of gap remains? │
                                               └─────────────┬────────────┘
              ┌──────────────────┬─────────────────────┬─────┴───────────────┐
              ▼                  ▼                     ▼                      ▼
        KNOWLEDGE          BEHAVIOR/FORMAT        CAPABILITY            COST/LATENCY
     (missing facts,    (won't follow style,   (can't do the task   (quality OK, bill
      freshness, cites)  format, tone)          at any prompt)        or p95 too high)
              │                  │                     │                      │
              ▼                  ▼                     ▼                      ▼
            RAG          Fine-tune (LoRA/DPO)    Bigger/better model    Distill teacher→
        (update index,   on 100s–1000s of        OR more ICL/CoT.       student, OR fine-
         not weights)    curated examples.       Fine-tuning will      tune a small model
                         Need an eval set.       NOT add capability    on the stable task.
                                                 the base lacks.
```

**Read it as a priority order, not a menu.** Cheapest, most reversible levers first: **prompt → RAG → fine-tune small → distill → full fine-tune**. Climb only when the cheaper rung is genuinely exhausted *against a real eval*, not against a hunch.

A blunter heuristic:
- **knowledge gap → RAG**
- **behavior/format gap → fine-tune**
- **capability gap → bigger model (then ICL to steer it)**
- **cost/latency at scale → distill, or fine-tune a small model**

---

## 3. When each is the WRONG tool (this is where money dies)

| You're tempted to… | Don't, because… | Do instead |
|--------------------|-----------------|------------|
| **Fine-tune to add facts** | Fine-tuning does *not* reliably inject knowledge — the model parrots the *form* of your examples and still hallucinates the content. Worse, it *forgets* other things (§5). Facts also go stale the day after you train. | **RAG.** Knowledge belongs in a retrievable index, not in weights. |
| **RAG to fix tone/format** | Retrieving better passages changes *what* the model sees, not *how* it writes. You'll get correct facts in the wrong shape. | **Prompt** (cheap) or **fine-tune** (if the prompt fix doesn't stick at scale). |
| **Fine-tune before exhausting prompt + RAG** | Premature: expensive, slow to iterate, and brittle — you've frozen a guess into weights and now own retrains forever. Most "we need to fine-tune" problems are a weak prompt or missing context. | Exhaust **prompt → RAG** first. Fine-tune only when a *good* prompt provably can't get there or is too expensive per call. |
| **Distill without a stable task** | If the task definition still moves, the student is obsolete on arrival and you can't even tell — the eval keeps changing. | Stabilize the task + eval *first*. Distill last, when quality is settled and only cost/latency remains. |
| **Keep using ICL when the prompt is huge & repeated** | A 3K-token instruction block sent on every call is a permanent tax on cost *and* latency, and long prompts dilute attention. | **Fine-tune** to bake the stable instructions into weights; calls get shorter, cheaper, faster. |
| **Reach for a bigger model for a format problem** | Capability isn't the gap; you'll overpay for reasoning you don't need and still get inconsistent format. | **Fine-tune** a *small* model on the format. |

The single most common and most expensive error: **fine-tuning to make the model "know" something.** It is the wrong tool by mechanism, not by degree. Knowledge → RAG. Always.

---

## 4. Fine-tuning mechanics you actually need

### PEFT / LoRA / QLoRA
- **PEFT** (parameter-efficient fine-tuning) = train a tiny fraction of params, freeze the rest. LoRA is the dominant member.
- **LoRA:** inserts low-rank matrices (rank `r`, typ. 8–64) into attention/MLP layers; only those train. ~0.1–1% of params updated. Cheap, fast, and you can **swap adapters** per task without storing full model copies.
- **QLoRA:** base weights quantized to 4-bit (NF4) + LoRA adapters in higher precision. Lets you fine-tune a 70B model on a single 48–80GB GPU. Near-LoRA quality at a fraction of the memory.
- **Default choice:** LoRA (or QLoRA if VRAM-bound). Full SFT only when you have lots of data, budget, ops maturity, and a measured reason adapters aren't enough.

### Preference tuning (DPO and kin)
- **SFT teaches imitation** ("produce outputs like these"). **DPO teaches judgment** ("prefer this over that") from `(prompt, chosen, rejected)` triples. No separate reward model, simpler than RLHF/PPO.
- Use DPO/ORPO/KTO when "good" is about *ranking* — conciseness, safety refusals, helpfulness — that's hard to specify by example alone. Common pattern: **SFT first to set the format, then DPO to refine the judgment.**

### Data: quality ≫ quantity
- **Quality dominates.** A few hundred *clean, consistent, on-distribution* examples beat tens of thousands of noisy ones. The model imitates your data faithfully — including its mistakes, its inconsistencies, and its format drift.
- **Rough scale:** LoRA behavior/format/classification often lands in the **low hundreds to low thousands** of examples. More data with worse consistency is a downgrade, not an upgrade.
- **Consistency is the asset:** every example formatted the same way, labeled by the same rubric, reflecting the *exact* behavior you want at inference. One inconsistent labeler poisons the run.
- **Match the inference distribution:** train on inputs that look like production. Train on clean prose, deploy on messy user text → it breaks.

### Eval-driven, always
- **No held-out eval set = do not fine-tune.** Without it you cannot tell improvement from regression, and you *will* regress something. Build the eval before the training data.
- **Hard split:** train / eval examples must never overlap. Leakage (§5) makes a broken model look perfect.
- Eval the **whole behavior**, not just the target task — including a regression check on general capability to catch forgetting.

---

## 5. Failure modes — name them, build guards against them

| Failure | What it looks like | Guard |
|---------|--------------------|-------|
| **Fine-tuning to memorize facts** | Confident, fluent, *wrong* answers; right format, fabricated content | Put knowledge in **RAG**; fine-tune only for behavior |
| **No eval set** | "Seems better" with no number; can't defend the change | Build held-out eval **before** training; gate the run on it |
| **Data leakage (train ↔ eval)** | Eval score great, production score bad | Dedup + split by source/entity before training; verify zero overlap |
| **Overfitting** | Memorizes train examples, fails near-duplicates; brittle to phrasing | Fewer epochs, lower LoRA rank, more diverse data, early-stop on eval loss |
| **Catastrophic forgetting** | Now great at the task, *worse* at things it used to do | PEFT (less invasive than full SFT), lower LR, mix in general data, regression-test broad ability |
| **Drift** | Quality silently decays as the world / inputs move | Monitor production metrics; schedule retrains; keep volatile facts in RAG, not weights |
| **Distilling an unstable task** | Student ships already-obsolete; can't tell because eval moves | Freeze task + eval first; distill last |
| **Retrain treadmill underestimated** | "One training run" becomes a quarterly ops burden | Budget the *lifecycle* (data refresh, retrain, re-eval, redeploy), not just run #1 |

**Catastrophic forgetting** deserves its own emphasis: weights are shared, so teaching one thing can erase another. It is the hidden cost that makes fine-tuning-for-facts doubly wrong — you pay to *not* learn the fact *and* to forget something useful. Mitigate with PEFT, conservative learning rates, mixing in general-purpose data, and a broad regression eval after every run.

---

## 6. Combining levers (the real-world answer is usually "and," not "or")

These are not exclusive. Production systems stack them:

- **RAG + fine-tuned small model** — the most common mature pattern. RAG supplies fresh, attributable *knowledge*; the small fine-tune nails *format/tone* and makes each call cheap. Knowledge stays swappable in the index; behavior stays baked in the weights. Best of both, and neither does the other's job.
- **ICL + RAG** — retrieved chunks plus a few-shot template and instructions. The default starting architecture before any training exists.
- **SFT → DPO** — imitate the format, then refine the judgment.
- **Distill (teacher→student) + RAG** — student handles the narrow task cheaply; RAG keeps it factually current without retraining.
- **Fine-tune to shrink the prompt, then keep ICL for the variable part** — bake the stable 3K-token instruction block into weights; keep a small dynamic few-shot slot for per-request specifics.

Guiding split when combining: **knowledge → retrieval (mutable, external); behavior → weights (stable, internal).** Put each thing where it belongs and they stop fighting.

---

## 7. Worked example — adjudicating a real decision

**Scenario:** a customer-support assistant. It must (a) answer using the *current* product docs and *this* customer's plan/usage, and (b) reply in the company's terse, no-fluff house voice with a fixed structure (answer → next step → doc link).

The lazy instinct is "fine-tune it on our support transcripts." Walk the gaps instead:

1. **Knowledge gap?** Yes — current docs, per-customer state. That is a *knowledge* row → **RAG.** Index the docs + pull the customer record at query time.
2. **The trap, named:** fine-tuning on transcripts to "teach the product" is the §3 error in full. The facts go **stale** the day docs change; the model will **hallucinate** plausible-but-wrong details in perfect house format; and the run will **forget** unrelated ability. You'd pay to make the model *worse and more confident*.
3. **Behavior gap?** Yes — house voice + fixed structure won't hold from prompting alone across millions of varied tickets. That is a *behavior* row → **LoRA fine-tune** on a few hundred clean, consistently-formatted exemplar replies. This also **shrinks the prompt**: the style instructions move into weights, so every call is cheaper and faster.
4. **Capability gap?** No. A strong base model can do support reasoning given the right context. No bigger model needed.

**Resolution: RAG + LoRA together** (§6's canonical pair). Knowledge lives in the swappable index and stays fresh; behavior lives in the adapter and stays consistent. Each lever does its own job and they stop fighting.

**Mini-case (cost only):** a field-extraction step where a good prompt already hits the quality bar — but it's 10M calls/month on a frontier model. Quality gap = zero; the entire problem is cost/latency. → **Distill** the frontier model's outputs into a small student (or fine-tune a small model directly) once the schema is frozen. No new quality is needed, so no bigger model and no RAG — just move the *same* quality onto a cheaper engine.

---

## 8. Comparison table — the one-screen summary

| Dimension | In-context learning | RAG | Fine-tuning (LoRA/QLoRA) | Distillation |
|-----------|---------------------|-----|--------------------------|--------------|
| **Changes** | Behavior at inference | Knowledge in context | Weights (behavior baked in) | A small model's weights |
| **Solves the gap** | Capability-steering, quick format | Knowledge, freshness, citation | Behavior, format, style, tone, prompt-shrink | Cost/latency at fixed quality |
| **Training cost** | None | None (build index once) | Moderate (one run, repeated on drift) | Moderate–high (dataset + run) |
| **Per-call cost** | High (tokens every call) | Medium (retrieval + context tokens) | Low (short prompt) | Lowest (small model) |
| **Latency** | Higher (long prompts) | Medium (retrieval hop) | Low | Lowest |
| **Iteration speed** | Instant | Fast (re-index) | Slow (label → train → eval) | Slowest (needs stable task) |
| **Freshness** | Per-call | Excellent (update index) | Poor (stale until retrain) | Poor (retrain) |
| **Data needed** | A few examples | A corpus to index | 100s–1000s clean examples + eval | Teacher outputs + eval |
| **Reversibility** | Trivial (edit string) | Easy (swap index) | Hard (own retrains, forgetting) | Hard (rebuild dataset) |
| **Ops burden** | None | Index pipeline, retrieval eval | Train + eval + monitor + retrain | Same as fine-tune + teacher |

---

## 9. Operating rules (do / don't)

**Do**
- Try a *serious* prompt + few-shot first, and benchmark every other lever against it on the same eval.
- Build the held-out eval set **before** you collect training data or stand up retrieval.
- Put facts/knowledge in **RAG**; put behavior/format/tone in **weights**.
- Prefer **LoRA/QLoRA** over full SFT; prefer fine-tuning a **small** model over reaching for a bigger one when the gap is format, not capability.
- Treat **data quality and consistency** as the primary lever — a few hundred clean examples beat thousands of noisy ones.
- Regression-test broad capability after every fine-tune to catch forgetting.
- Budget the **whole lifecycle** of any weight change: data refresh, retrain, re-eval, redeploy.
- Stabilize the task + eval **before** distilling.

**Don't**
- Don't fine-tune to add facts. (Use RAG.)
- Don't use RAG to fix tone/format. (Use prompt or fine-tune.)
- Don't fine-tune before prompt + RAG are genuinely exhausted against a real eval.
- Don't fine-tune without a held-out eval set — you can't tell improvement from regression.
- Don't let train and eval data overlap. Verify zero leakage.
- Don't distill an unstable task — the student is obsolete on arrival.
- Don't keep paying a giant repeated prompt every call when fine-tuning would bake it in.
- Don't assume "one training run." Assume a retrain treadmill and price it in.

---

**Cross-references:** retrieval/chunking/index/retrieval-eval detail → **`rag`** skill. Prompt structure, few-shot design, output schemas → **`prompt-engineer`** skill. Eval-suite construction → your evaluation skill of record.
