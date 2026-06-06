# AI Engineering Skills

**13 reference-grade skills** for building production LLM & agent systems — harness and
context engineering through inference serving, caching, RAG, evals, observability, and
safety. For AI engineers shipping at scale, not prompt-tip lists.

Each skill is a self-contained `SKILL.md` (Claude Code / Vanta format), depth over fluff:
real numbers, formulas, pseudocode, comparison tables, do/don't, named production failure
modes, and attributions to the actual systems and papers (vLLM/PagedAttention,
FlashAttention, AWQ/GPTQ/SmoothQuant, RAGAS, OWASP LLM Top 10, OpenTelemetry GenAI).

## View it

Open **`index.html`** in any browser (self-contained, `file://`-safe). Grouped sidebar,
filter, collapsible cards.

## The skills

**Context & harness** — `harness-and-context-engineering` · `adaptation-strategies`
(fine-tune vs ICL vs RAG vs distillation)
**Inference & serving** — `inference-performance` (prefill/decode, batching, PagedAttention) ·
`inference-caching-and-kv` (prompt vs semantic caching, KV management) ·
`quantization-and-model-compression` (INT8/4/FP8, AWQ/GPTQ, spec-decoding, distillation)
**Reliability & agents** — `structured-output-and-tool-calling` (schema validation, repair
loops, idempotency) · `agent-reliability-and-guardrails` (budgets, termination, runaway
prevention) · `model-routing-and-fallback` (cascade, graceful fallback, degraded mode)
**Retrieval & evals** — `rag-architecture` (chunking, hybrid search, reranking, freshness) ·
`llm-evals-and-retrieval-quality` (golden sets, regression, LLM-as-judge, grounding/citation)
**Ops, cost & safety** — `llm-observability-and-cost` (traces/spans, cost attribution per
feature/tenant/user) · `llm-safety-and-multitenancy` (prompt injection, leakage, isolation) ·
`production-failure-modes-and-tradeoffs` (the failure taxonomy + latency/quality/cost/reliability map)

## Install as skills

Standard `SKILL.md` files. Claude Code: copy a `<slug>/` into `~/.claude/skills/`. Vanta:
auto-installed via `librarySources()` (this folder is a bundled source). Each `name:`
matches its folder.

## Regenerate the viewer

```bash
python3 scripts/build-skills-index.py ai-engineering-skills   # needs `mistune`
```
