---
name: llm-evals-and-retrieval-quality
description: Reference-grade guide to evaluating LLM and RAG systems — golden/regression/adversarial eval sets, LLM-as-judge and its biases, retrieval metrics (recall@k, MRR, nDCG), grounding/faithfulness/attribution, RAGAS-style scoring, eval-set construction from production traces, and the CI gates that stop silent regressions.
tags: [ai-engineering, evals, testing, llm-as-judge]
---
# LLM & Retrieval Evals

Evals are the core discipline of AI engineering. A model is a stochastic component you do not control: a prompt tweak, a temperature change, a model version bump, or a vendor silently re-routing your traffic can move quality in any direction, and none of it shows up in a stack trace. The only way to know whether a change helped or hurt is to **measure task performance on a fixed set of inputs you trust**. "It looks better" is a hypothesis, not a result. Vibes don't ship — a passing eval suite does.

Evals are to LLM systems what tests are to ordinary software, with one twist: the output is non-deterministic and often open-ended, so the *grader* is itself a system you must build and validate. This guide covers what to measure (eval types, generation metrics, retrieval metrics, grounding), how to grade (exact match, embeddings, LLM-as-judge, humans), how to build and maintain an eval set, and how to wire evals into your delivery process so regressions get caught before users do.

The mental model: **inputs → system → outputs → grader → score → decision.** Every section below is one link in that chain. If any link is weak — a stale eval set, a biased judge, a metric that doesn't track the task — the score lies, and you ship blind.

---

## 1. Why evals, concretely

- **You can't improve what you can't measure.** Iteration without a scorecard is a random walk. With a scorecard, every change is a labeled experiment.
- **Silent regressions are the default failure.** LLM output degrades gracefully-looking: still fluent, still confident, subtly wrong. No exception, no 500. Only an eval catches "accuracy dropped from 88% to 71% after the model upgrade."
- **Model swaps are not drop-in.** GPT-4o → GPT-4.1, Sonnet → a cheaper Haiku, an open-weights migration — each shifts the output distribution. The eval is the acceptance test for the swap.
- **Prompts are code with no type system.** A one-word prompt edit can break JSON formatting on 12% of inputs. Regression evals are your compiler.
- **Evals turn arguments into experiments.** "Should we use few-shot here?" is answerable in an hour with an eval set, versus a week of stakeholder opinion.

**Capability evals ≠ product evals.** Public benchmarks (MMLU, GSM8K, HumanEval, MT-Bench) measure a *model's* general capability and help you pick a base model. They tell you almost nothing about *your* task on *your* data — a model can top a leaderboard and fail your extraction schema. They are also heavily contaminated (leaked into training sets), so a high public score is partly memorization. Build **product evals** on your own inputs; treat benchmarks only as a coarse shortlist for which models to even try.

> Rule of thumb: if you cannot state the metric and the threshold a change must clear, you are not ready to make the change.

---

## 2. Eval types — what to build

| Type | What it is | Catches | Cadence |
|---|---|---|---|
| **Golden / reference set** | Curated `input → expected output` pairs, hand-blessed | Core correctness on representative cases | Every change |
| **Regression set** | Frozen suite of previously-passing cases | Quality drops on deploy / model swap / prompt change | CI, **blocking** |
| **Adversarial / red-team** | Edge cases, injections, jailbreaks, refusal probes | Safety + robustness failures | Pre-release, periodic |
| **Unit eval** | One component in isolation (a tool call, a router, a parser) | Localized defects, fast feedback | Per-commit |
| **End-to-end eval** | Full pipeline, real user inputs | Integration + emergent failures | Pre-deploy, canary |

**Golden sets** are the backbone: small, high-quality, human-verified. Each item carries the input, the expected output (or a rubric/checklist when output is open-ended), and metadata (category, difficulty, source). Quality over quantity — 80 well-chosen cases beat 5,000 noisy ones.

**Regression sets** exist to fail loudly. They are golden cases promoted to a CI gate: if a change drops the pass rate below threshold, the build is red. No regression gate = a prompt tweak can quietly break prod and nobody knows until a customer complains.

**Adversarial sets** probe the unhappy path on purpose: prompt injection ("ignore previous instructions…"), jailbreaks, PII exfiltration attempts, out-of-scope requests that *should* trigger refusal, ambiguous or contradictory inputs, and inputs in the wrong language/format. Track refusal correctness in both directions — over-refusal (declining valid requests) is as much a failure as under-refusal (complying with harmful ones).

**Unit vs end-to-end.** Decompose the pipeline (retriever, reranker, prompt assembly, generation, post-parse) and eval each unit so failures are attributable, then run an end-to-end eval so you catch interaction effects. A retriever can score 95% recall and the end-to-end answer still be wrong because the generator ignored the context. You need both.

---

## 3. Grading methods — how to score an output

### 3.1 Exact / structural match
Use when the output space is closed: classification labels, extracted fields, JSON conforming to a schema, SQL that must run, a number. Grade with `==`, schema validation (Zod/Pydantic/JSON-Schema), or execution (does the SQL return the right rows?). Cheap, deterministic, zero judge bias. **Prefer this whenever the task can be made structured** — it's the gold standard when it applies.

For classification/extraction tasks, report the confusion-matrix family, not bare accuracy: **precision** = TP/(TP+FP), **recall** = TP/(TP+FN), **F1** = 2·P·R/(P+R). Accuracy lies on imbalanced data (99% "not-spam" accuracy by always answering "not-spam"). Use **macro-F1** when every class matters equally, **micro-F1** when frequent classes should dominate. For a router/classifier, the per-class confusion matrix tells you *which* class it confuses, which an aggregate score hides.

### 3.2 Reference-based text metrics (BLEU, ROUGE, METEOR, exact-string)
N-gram overlap against a reference answer. **Weak for generation.** They reward surface lexical overlap, not meaning: a correct paraphrase with different words scores low; a fluent wrong answer that reuses input words scores high. Acceptable as a cheap signal for translation/summarization with tight references; near-useless for open-ended Q&A, chat, or agentic output. Do not gate releases on ROUGE alone.

### 3.3 Embedding / semantic similarity
Cosine similarity between embeddings of output and reference. Captures meaning better than n-grams, tolerates paraphrase. But it's a blunt scalar — it can't tell you *why* something is wrong, conflates topical similarity with correctness, and a confidently-wrong answer on the right topic scores high. Use as a coarse filter or a regression tripwire, not a final verdict.

### 3.4 LLM-as-judge (the workhorse for open-ended output)
A strong model grades the output against a rubric. Two modes:

- **Pointwise / rubric:** judge scores one output on an absolute scale (e.g., 1–5 on "faithfulness", or pass/fail per criterion). Better for tracking absolute quality over time and for CI thresholds.
- **Pairwise:** judge picks the better of two outputs (A vs B). Lower variance, more reliable for *ranking* two systems/prompts, the basis of preference leaderboards. Worse for absolute thresholds.

**Use pairwise to choose between candidates; use pointwise/rubric to gate and trend.**

LLM-as-judge **gotchas** — every one of these is a known, measured bias:

| Bias | What happens | Mitigation |
|---|---|---|
| **Position bias** | Judge favors the first (or last) option in pairwise | Randomize order; run both orders and average; require consistency |
| **Verbosity / length bias** | Longer answers rated higher regardless of quality | Rubric penalizing fluff; control for length; pairwise on equal-length |
| **Self-preference** | Judge prefers outputs from its own model family | Use a different model family as judge than as generator |
| **Sycophancy / leniency** | Judge agrees with assertive or confident phrasing | Concrete rubric, require evidence/quote citations in the verdict |
| **Miscalibration** | "7/10" means nothing stable across runs | Use few discrete levels (pass/fail, 1–3), anchor each level with an example |
| **Format/style halo** | Well-formatted markdown rated as more correct | Separate "format" and "correctness" criteria in the rubric |

A usable rubric looks like a graded checklist, not a vibe scale. Example for a support-answer faithfulness judge:

```
For each claim in the ANSWER, label it against the CONTEXT:
  SUPPORTED   — context entails the claim
  UNSUPPORTED — context neither entails nor contradicts (no basis)
  CONTRADICTED— context contradicts the claim
First list claims with labels and a quoted supporting span; THEN output:
  PASS  = all claims SUPPORTED
  FAIL  = any claim UNSUPPORTED or CONTRADICTED
Output JSON: { "claims": [...], "verdict": "PASS"|"FAIL" }
```

This binds the judge to evidence (quoted spans), forces reasoning before the verdict, and yields a binary gateable result instead of an uncalibrated 7/10.

Non-negotiables for LLM-as-judge:
- **Give it a rubric**, not "rate this 1–10." Define each score level with criteria and an anchor example. Ask for a brief justification *before* the score (chain-of-thought lifts judge reliability).
- **Use a strong judge.** A weak judge is a noisy ruler. The judge should be at least as capable as the system under test, ideally stronger.
- **The judge needs its own eval.** Validate judge verdicts against ~100+ human labels; report judge–human agreement (Cohen's κ or % agreement). An unvalidated judge is an opinion with API costs. Re-validate when you change the judge model.
- **Pin the judge model + prompt + temperature (0).** A judge that drifts is worse than no judge — your whole metric history becomes incomparable.

### 3.5 Human eval
Required when: defining ground truth for a new task, validating an LLM judge, evaluating subjective quality (tone, helpfulness, brand voice), safety-critical decisions, or when automated metrics disagree with intuition. Make it rigorous:
- **Clear rubric + labeled examples** so annotators apply the same standard.
- **Inter-rater agreement:** ≥2 raters per item on a subset; report Cohen's κ (2 raters) or Fleiss' κ / Krippendorff's α (>2). κ < 0.6 means your rubric is ambiguous — fix the rubric, not the raters. Adjudicate disagreements; they reveal edge cases worth adding to the golden set.
- **Sample, don't boil the ocean:** stratified sample across categories; size for a tolerable confidence interval (a few hundred items gives useful precision). Blind raters to which system produced which output.

### 3.6 Picking a method

| Output shape | Use | Avoid |
|---|---|---|
| Closed labels / schema'd JSON / runnable code | Exact + structural match, F1 | LLM-judge (overkill, noisier) |
| Short factual answer with a reference | Exact / embedding similarity, LLM-judge as backstop | BLEU/ROUGE alone |
| Long open-ended generation, chat, summaries | LLM-as-judge (rubric) + targeted human sample | BLEU/ROUGE/perplexity as a gate |
| Choosing between two systems/prompts | Pairwise LLM-judge or human preference | Pointwise absolute scores (higher variance for ranking) |
| Subjective quality, safety-critical, new task | Human eval (defines ground truth) | Automated metric as sole signal |

Default ladder: **make it structured → exact match; if you can't → LLM-judge with a rubric; validate the judge with humans; reserve full human eval for ground-truth and safety.**

---

## 4. Retrieval evals (RAG, search, memory)

Retrieval quality caps everything downstream: the generator cannot answer from context it never saw. Eval the retriever **separately** from the generator. You need a labeled set mapping queries → relevant documents/chunks (binary relevant, or graded relevance for nDCG).

| Metric | Formula / definition | Answers |
|---|---|---|
| **Recall@k** | (# relevant in top-k) / (total relevant) | Did we fetch the right chunks at all? |
| **Precision@k** | (# relevant in top-k) / k | How much of what we fetched is noise? |
| **Hit-rate@k** | fraction of queries with ≥1 relevant in top-k | Did we get *anything* useful? |
| **MRR** | mean of 1/rank of the first relevant result | How high is the first good hit? |
| **MAP** | mean of average-precision per query | Ranking quality across all relevant items |
| **nDCG@k** | DCG/IDCG, DCG = Σ relᵢ/log₂(i+1) | Graded relevance + position-discounted ranking |

`MRR = (1/N) Σ 1/rankᵢ` — only the first relevant hit matters, good for "one right answer" lookups. `nDCG` rewards putting *more* relevant items *higher* with graded labels, the right metric when many chunks are partially relevant.

**Context-level RAG metrics** (RAGAS-style):
- **Context recall** — of the facts needed to answer, what fraction are present in the retrieved context? Low recall = retriever is the bottleneck.
- **Context precision** — are the relevant chunks ranked above the irrelevant ones? Low precision = reranking/filtering problem; also wastes the context window and invites distraction.

**Recall vs precision tradeoff at k:** raising k lifts recall but dilutes precision and bloats the prompt (cost + lost-in-the-middle errors). Tune k against the end-to-end answer metric, not recall in isolation.

**What retrieval evals diagnose.** A low recall@k is rarely "the embedding model is bad" — it's usually upstream: chunks too large (relevant fact buried with noise, embedding washed out) or too small (fact split across chunks); the wrong embedding model for the domain; no hybrid (dense + BM25/lexical) so exact-match terms like IDs and error codes are missed; or no reranker so the relevant chunk sits at rank 18. Ablate each: hold the eval set fixed and vary chunk size, embedding model, hybrid on/off, reranker on/off — the metric delta attributes the gain. This is why the labeled query→chunk set is worth building once and reusing for every retrieval change.

---

## 5. Grounding, faithfulness, and attribution (the hallucination guards)

A RAG answer can retrieve perfectly and still hallucinate. These metrics check the *generation* against the retrieved context:

- **Faithfulness / groundedness:** is every claim in the answer *supported by* the retrieved context? Decompose the answer into atomic claims, then check each against the context (NLI model or LLM-judge: entailed / contradicted / unsupported). `Faithfulness = supported claims / total claims`. An unsupported-but-true claim still fails grounding — it means the model is generating from parametric memory, which you cannot audit.
- **Answer relevance:** does the answer actually address the question (vs answering a related question, or padding)? Often scored by generating questions the answer would answer and comparing to the original.
- **Attribution / citation quality:** when the system cites sources, are the citations correct?
  - **Citation precision** = correct citations / total citations (no fabricated or wrong-source cites).
  - **Citation recall** = claims-with-a-supporting-cite / claims-that-need-one (no uncited claims that should be sourced).
  - A confidently-cited answer where the cited passage doesn't support the claim is the most dangerous failure — it *looks* trustworthy.

**The RAG triad** — measure all three or you can't localize a failure: **context relevance** (retriever), **faithfulness** (generator grounding), **answer relevance** (generator on-task). Low context relevance → fix retrieval. High context relevance + low faithfulness → fix the prompt/generator. High on both + low answer relevance → fix instruction-following.

---

## 6. Building and maintaining an eval set

The eval set *is* the asset. The model is rented; the labeled eval set is owned IP and the moat.

- **Source from production traces.** Real user inputs beat synthetic ones — they carry the actual distribution, including the weird 5% you'd never invent. Log inputs, outputs, retrieved context, and (when available) user feedback / corrections.
- **Mine failures continuously.** Every thumbs-down, every escalation, every bug report → a candidate eval case. The failures of today are the regression tests of tomorrow. This is the flywheel: ship → observe failures → add to eval set → fix → the fix is now guarded forever.
- **Cover the space deliberately.** Stratify by category, difficulty, input length, language, and user segment. Track a coverage matrix; backfill thin cells. Include the boring happy path *and* the long tail.
- **Size:** start small (50–100 high-signal cases) and grow toward the failure modes that matter. Precision of your pass-rate estimate scales with set size; for tight gates you want a few hundred per critical category.
- **Freshness:** eval sets rot. New features, new user behavior, new model versions change the distribution. Schedule reviews; retire stale cases; add new ones from recent traces. A two-year-old eval set measures a product that no longer exists.
- **Avoid train/eval leakage:** never put eval inputs into few-shot prompt examples, fine-tuning data, or the retrieval corpus you're testing against. If the model has seen the answer, the score is fiction. Keep a held-out set the system has *never* been tuned against, and rotate a fresh holdout periodically to detect overfitting to the eval itself.
- **Version the eval set.** Treat it like code: it's in git, changes are reviewed, and every metric is reported against a named eval-set version so historical numbers stay comparable.

---

## 7. Process — eval-driven development

Wire evals into delivery so measurement is automatic, not heroic.

1. **Eval-driven development:** write/extend the eval set *before* changing the prompt or model, the way TDD writes the test first. Define the metric and target, then iterate until the number moves.
2. **Run on every change** to prompts, models, retrieval config, chunking, or tooling. No "I just tweaked one word" exceptions — that's exactly where regressions hide.
3. **Thresholds and gates:** the regression suite blocks CI. Define gates per metric (e.g., faithfulness ≥ 0.9, no drop > 2pts vs baseline on the golden set, zero new jailbreak passes). A failing gate is a red build, not a Slack warning everyone mutes.
4. **Dashboards:** trend metrics per eval-set version over time and per model/prompt version. A single number today is noise; the trend line is the signal. Slice by category so a localized regression isn't hidden by a healthy average.
5. **Offline vs online evals.**
   - **Offline** — fixed eval set, pre-deploy, reproducible, gates releases.
   - **Online** — production signals: user feedback (👍/👎, edits, retries, abandonment), task-completion rate, automated LLM-judge on a sample of live traffic, latency/cost. Online catches what your offline set didn't anticipate. Mine **implicit** signals too — they're cheaper and less biased than thumbs: edit-distance between the model's answer and what the user shipped, copy/accept events, follow-up "no, I meant…" turns, regenerate clicks, session abandonment, and downstream success (did the generated code pass CI? did the email get sent?). Route low-scoring live samples straight into the failure-mining queue (§6).
6. **A/B + canary:** roll a change to a small slice, compare online metrics against control, ramp only if it wins (or holds) on the metrics that matter. Canary first when the blast radius is large.
7. **Drift detection:** monitor input distribution (new topics, languages, lengths) and output metrics over time. A silent provider model update or a seasonal shift in user behavior degrades quality with no deploy on your side. Cross-reference observability/tracing to attribute drift. (See an observability/tracing skill for span-level instrumentation.)

**Aggregation and significance.** A pass rate is an estimate with error bars. Two systems at 84% and 86% on 100 cases are *not* distinguishable — the 95% CI on a proportion is roughly ±10pts at n=100, ±3pts at n=1000. Before declaring a winner: report the confidence interval (Wilson interval for proportions), and for paired comparisons on the same inputs use a paired test (McNemar's for pass/fail, bootstrap for continuous scores). Run non-deterministic systems **k times per input** (k≥3) and average to separate true change from sampling noise. "It went up 2 points" on a tiny set is the single most common way teams ship a regression while celebrating.

**Quality is not the only axis.** Every eval run should also report **cost** (tokens/$ per task) and **latency** (p50/p95 end-to-end). A change that lifts faithfulness 1pt while doubling cost or pushing p95 past your budget is often a net loss — surface all three so the decision is honest. The cheaper model that's "98% as good" is frequently the right call, and only a multi-axis eval makes that visible.

**Tooling.** You can hand-roll evals (a JSONL set + a scoring script + a CI job — start here, it's a day of work). Mature options: RAGAS (RAG faithfulness/relevance/context metrics), promptfoo and DeepEval (declarative eval suites + CI), Braintrust / LangSmith / Langfuse (eval + tracing + dashboards), OpenAI Evals / inspect-ai (framework-grade harnesses). Pick one once you've outgrown the script; don't let tool selection delay having *any* eval.

> Every metric should map to a decision. If a number can't change what you ship, stop computing it.

---

## 8. Do / Don't

**Do**
- Make the task structured (closed labels, schema-validated JSON) whenever you can — exact match beats every fuzzy grader.
- Validate your LLM judge against human labels and report agreement before trusting it.
- Build the eval set from real production traces and mined failures.
- Gate CI on a frozen regression suite; block the build on a drop.
- Eval retriever and generator separately, then end-to-end.
- Measure grounding/faithfulness and citation accuracy for any RAG system.
- Version eval sets and report metrics against a named version.
- Randomize order and control for length in pairwise LLM-as-judge.

**Don't**
- Ship on vibes or a handful of cherry-picked examples.
- Gate releases on BLEU/ROUGE/perplexity for open-ended generation.
- Use the same model family as both generator and judge (self-preference).
- Leak eval inputs into prompts, few-shot, fine-tuning, or the retrieval corpus.
- Let the eval set go stale or stay tiny for a system that's grown.
- Optimize a proxy metric until it decouples from the real task (Goodhart).
- Trust a single average — slice by category and watch the trend.
- Run an unvalidated, unpinned judge whose verdicts drift run to run.

---

## 9. Failure modes (the ones that bite in production)

- **No eval set →** silent regressions. The most common and most expensive failure: quality drops on a model/prompt change and you find out from churn, not CI.
- **Judge bias →** position/verbosity/self-preference skew the metric; you optimize toward the bias (longer, more confident, same-family answers) instead of quality.
- **Tiny or stale set →** a pass rate with a huge confidence interval, or one that measures a product you no longer ship. Looks green, means nothing.
- **Train/eval leakage →** inflated scores that collapse in production. The model memorized the test.
- **Measuring perplexity, not task →** low perplexity ≠ correct answers, faithful grounding, or completed tasks. Perplexity is a language-modeling metric, not a product metric.
- **Gaming the metric (Goodhart) →** the system learns to satisfy the grader, not the user — verbose answers to please a length-biased judge, keyword-stuffed text to please ROUGE, refusals to dodge a safety metric. Rotate held-out sets and keep humans in the loop to detect it.
- **No regression gate →** a "harmless" prompt tweak quietly breaks 8% of prod traffic because nothing blocked the merge.
- **Averaging away a regression →** overall score flat, but a critical category cratered. Always slice.
- **Retriever-only evaluation →** 95% recall@k and the end-to-end answer is still wrong because the generator ignored or contradicted the context. Grounding eval is mandatory, not optional.
- **Citing without verifying citations →** answers that *look* sourced but cite passages that don't support the claim — the highest-trust, highest-risk failure.

---

## 10. Minimum viable eval program

If you do nothing else, do this, in order:

1. A **golden set** of 50–100 real, human-verified `input → expected/rubric` cases from production traces.
2. A **regression gate** in CI that runs that set and blocks merges on a drop.
3. For RAG: **retrieval metrics** (recall@k, MRR) + a **faithfulness** check on answers.
4. An **LLM-as-judge** with a written rubric, a non-self judge model, and a **one-time human validation** of its agreement.
5. **Online feedback** capture (👍/👎 + edits) feeding new failures back into the golden set.

That loop — measure, gate, observe, mine failures, grow the set — is the entire discipline. Everything else is refinement.
