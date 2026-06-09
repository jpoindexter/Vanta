---
name: rag-architecture
description: Design production retrieval-augmented generation systems — the full ingest→chunk→embed→index→retrieve→rerank→assemble→generate pipeline, with concrete numbers on chunking, embeddings, hybrid search, reranking, query processing, indexing ops, context assembly, and the failure modes that wreck precision.
tags: [ai-engineering, rag, retrieval, embeddings, search]
---
# RAG Architecture

RAG is **search + prompt**, not magic. The model can only answer from what retrieval puts in the context window, so 80% of RAG quality is the retrieval system and 20% is the prompt. Most "the LLM hallucinated" bugs are actually "retrieval returned garbage and the model dutifully summarized it." Build the pipeline so the right chunks land in context with citations, and tell the model to say "I don't know" when they don't. This skill is the concrete playbook: numbers, methods, tables, and the failure modes that cost precision.

## 1. The pipeline — eight stages, two phases

**Index time (offline, batch):** ingest → chunk → embed → index. **Query time (online, latency-bound):** retrieve → rerank → assemble → generate.

| Stage | Job | Latency budget (typical) |
|---|---|---|
| Ingest | Parse source → clean text + metadata | offline |
| Chunk | Split into retrievable units | offline |
| Embed | Text → vector | offline (docs), ~10–50ms (query) |
| Index | Store vectors + metadata for ANN | offline |
| Retrieve | top-k candidates (dense + sparse) | 10–50ms |
| Rerank | Cross-encoder reorders k→n | 50–300ms |
| Assemble | Select, dedup, order, budget, cite | <5ms |
| Generate | LLM answers from context | 1–10s (dominates) |

**Do** treat each stage as independently measurable and swappable. **Don't** optimize generation prompts before you've measured retrieval recall — you're polishing the 20%.

**When RAG vs alternatives:** RAG when knowledge is **large, changing, private, or needs citations** (docs, tickets, codebases, policies). **Long-context stuffing** when the whole corpus fits the window and is small/static — simpler, no index. **Fine-tuning** to teach *style/format/behavior*, not facts — fine-tuning bakes knowledge in stale and unverifiable; it's the wrong tool for "answer from current documents." Tool/SQL calling when the answer is a precise lookup or computation over structured data, not fuzzy text. Most production systems combine RAG (facts) + light fine-tuning or few-shot (format) + routing (§7) to the right one per query.

## 2. Chunking — the highest-leverage, most-neglected decision

A chunk is the atomic unit of retrieval. Chunk wrong and the answer is split across two chunks that never co-retrieve, or buried in a 2000-token wall of noise. There is no universal best size; it's a recall/precision tradeoff against your content and embedding model's context window.

| Strategy | How | Use when | Cost |
|---|---|---|---|
| **Fixed-size** | N tokens, hard cut | Uniform prose, fast baseline | Splits mid-sentence/mid-table |
| **Recursive** | Split on ¶→sentence→word, respecting separators | General default (most corpora) | Slightly more compute |
| **Semantic** | Split where embedding similarity between adjacent sentences drops below a threshold | Topic-dense docs, mixed subjects | Embedding cost at index time |
| **Structural** | Split by Markdown heading / HTML section / AST function | Docs, code, anything with structure | Needs a parser per format |

**Size + overlap (start here, then tune):**
- **256–512 tokens** is the sweet spot for most QA. Smaller (128–256) = sharper precision, more chunks, more fragmentation. Larger (512–1024) = more context per hit, lower precision, dilutes the embedding (one vector averaging many topics).
- **Overlap 10–20%** (e.g. 50–100 tokens on a 512 chunk) so an answer straddling a boundary survives in at least one chunk. Zero overlap loses boundary answers; >25% wastes index space and double-counts.
- Code: split on **function/class boundaries** (AST/tree-sitter), never fixed tokens — a half-function is useless.

**Metadata per chunk** (index this, filter and cite on it): `source_id`, `doc_title`, `section_heading`, `url`, `page`, `created_at`, `updated_at`, `version`, `author/acl`. Filtering on metadata at retrieval (`WHERE tenant_id = X AND updated_at > …`) is often a bigger precision win than any embedding tweak.

**Parent-document / small-to-big:** embed **small** chunks (high precision match) but return the **parent** (the section/page they belong to) to the LLM (full context). Index child→parent pointers; retrieve on children, hydrate parents at assembly. Best default for docs.

**Contextual retrieval (Anthropic, 2024):** before embedding each chunk, prepend a 50–100 token LLM-generated blurb situating it in the whole doc ("This chunk is from the Q3 2023 10-K, discussing revenue recognition…"). Anthropic reports it cuts failed retrievals ~35%, ~49% combined with BM25, ~67% combined with reranking. One-time cost; with prompt caching the per-chunk LLM cost is small (~$1/M tokens). Worth it whenever chunks lose meaning out of context (most do).

**Worked sizing example** (support-doc corpus, answers are 1–3 sentences):
- 1024-token chunks → each vector averages ~4 topics; a query about one topic matches weakly; precision poor.
- 128-token chunks → high precision per hit, but a procedure spanning 6 steps fragments across 4 chunks; recall poor unless you retrieve k=20+.
- **384 tokens, 64 overlap, recursive split on headings** → one procedure usually fits one chunk, boundary answers survive overlap; ship this, then move ±128 based on recall@k.

**Failure mode:** the #1 RAG bug is **bad chunking that splits one answer across two chunks** — neither chunk alone scores high enough, so the model gets half an answer and confabulates the rest. Fix with overlap, structural splits, or small-to-big.

**Ingest hygiene (before chunking):** strip nav/boilerplate/HTML chrome, normalize whitespace, OCR or layout-parse PDFs (tables and multi-column break naive text extraction), and keep tables/code as intact units. Garbage in ingest is garbage in every downstream stage — and it's invisible until eval. Dedup identical docs at ingest, not at query time.

## 3. Embeddings — the semantic substrate

The embedding model turns text into the vector whose nearest neighbors are "relevant." Choosing it is choosing your recall ceiling.

**Selection criteria:**
- **Quality:** MTEB leaderboard (retrieval task subset specifically — not the aggregate). Don't trust the headline average; filter to retrieval/reranking.
- **Dimension:** 384 / 768 / 1024 / 1536 / 3072 are common. Higher dim = marginally better quality, linearly more storage and slower ANN. 768–1024 is the practical sweet spot. **Matryoshka (MRL)** embeddings let you truncate (e.g. 1536→512) with graceful quality loss — store full, query truncated.
- **Domain fit:** a general model on legal/medical/code underperforms a domain or instruction-tuned one. Test on *your* queries, not benchmarks.
- **Multilingual:** if queries and docs differ in language, you need a multilingual model (e5-multilingual, BGE-M3, Cohere multilingual) or cross-language retrieval silently fails.
- **Context length:** chunk must fit the model's max tokens (often 512; newer ones 8k). Truncation at embed time silently drops the tail.

**Normalization:** L2-normalize vectors so cosine similarity = dot product (faster, and most ANN indexes assume it). Do it once at index time and at query time. Mismatched normalization between index and query silently tanks recall.

**Query vs document asymmetry:** queries ("how do I reset my password?") and documents ("Password reset is available under Settings…") have different shapes. Asymmetric models (e5, BGE, instructor) want a **prefix** — `query:` vs `passage:`, or an instruction. Using the wrong prefix, or none, degrades recall measurably. Read the model card; this is the most common silent misconfiguration.

**Cost:** hosted ~$0.02–0.13 / 1M tokens (OpenAI text-embedding-3, Cohere, Voyage). Self-hosted (BGE, e5, Nomic, GTE) = GPU/CPU time, zero per-call. At millions of docs, self-hosting often wins; at low volume, hosted is simpler.

| Model | Dim | Context | Host | Notes |
|---|---|---|---|---|
| OpenAI `text-embedding-3-small` | 1536 (MRL-truncatable) | 8191 | hosted | Cheap default, strong general |
| OpenAI `text-embedding-3-large` | 3072 (truncatable) | 8191 | hosted | Higher quality, 2× cost |
| Cohere `embed-v3` | 1024 | 512 | hosted | Strong multilingual, query/doc input types |
| Voyage `voyage-3` | 1024 | 32k | hosted | Long-context, code/finance variants |
| `BGE-M3` | 1024 | 8192 | self | Dense+sparse+multivector in one, multilingual |
| `e5-large-v2` | 1024 | 512 | self | Needs `query:`/`passage:` prefixes |
| `nomic-embed-text-v1.5` | 768 (MRL) | 8192 | self | Open, long-context, task prefixes |

Pick by your retrieval-task MTEB score **on your data**, then weigh dim/context/host against it — never by headline average alone.

**Embedding drift — the upgrade trap:** vectors from model v1 and model v2 live in **different, incomparable spaces**. You **cannot** mix them in one index. Upgrading the embedding model means **re-embedding the entire corpus** and rebuilding the index — a batch job, not a config flip. Plan for it: version your embeddings, keep raw text as source of truth, run old+new indexes in parallel during cutover, A/B before flipping. **Failure mode:** someone bumps the model name, new docs embed with v2, queries embed with v2, but old docs are still v1 — recall silently collapses for everything indexed before the change.

## 4. Indexing & vector search — ANN, not brute force

Exact nearest-neighbor (compare query to every vector) is O(N) — fine to ~100k vectors, death at millions. **Approximate nearest neighbor (ANN)** trades a few % recall for 10–1000× speed.

| Index | How | Strength | Tradeoff |
|---|---|---|---|
| **HNSW** | Navigable small-world graph, layered | Best recall/latency, default everywhere | High memory; slow/awkward deletes |
| **IVF** | Cluster (k-means), search nearest cells | Lower memory, fast build | Needs training; tune `nprobe` for recall |
| **IVF-PQ** | IVF + product quantization (compress vectors) | Massive corpora, low memory | Quantization loses precision |
| **Flat (exact)** | Brute force | 100% recall, ground truth for eval | O(N), only small sets |

**Tune the recall/latency knobs:** HNSW `ef_search` (higher = better recall, slower) and `M` (graph degree); IVF `nprobe` (cells probed). Always benchmark recall@k against a Flat index on a held-out query set — don't guess.

**Metadata filtering** is non-negotiable in production (tenant isolation, ACLs, date ranges, doc type). **Pre-filter** (restrict candidate set before ANN — accurate but can be slow if filter is selective and fights the graph) vs **post-filter** (ANN then drop non-matching — fast but may return <k after filtering). Good vector DBs do filtered HNSW. Verify your DB doesn't silently degrade to post-filter and return too few results.

**Vector DB choice:** pgvector (you already run Postgres — start here; HNSW + SQL filters + transactions in one place), Qdrant / Weaviate / Milvus (purpose-built, scale + hybrid built in), Pinecone / Turbopuppy / managed (zero-ops, pay per vector), or Elasticsearch/OpenSearch (you already run it for search). **Do** start with pgvector unless you have >10M vectors or need built-in hybrid. **Don't** adopt a new infra component before you've outgrown the database you already operate.

## 5. Hybrid search — dense + sparse, because neither alone is enough

**Dense (semantic)** retrieval matches meaning — great for paraphrase, synonyms, intent. It **fails on exact tokens**: product IDs (`SKU-4417`), error codes (`ERR_0x80`), acronyms, names, rare jargon, version numbers — because they barely move a semantic embedding. **Sparse (lexical, BM25)** matches exact terms — great for those, useless for paraphrase.

**Run both, fuse.** The standard fusion is **Reciprocal Rank Fusion (RRF):** `score(d) = Σ 1/(k + rank_i(d))` over each retriever's ranked list, `k≈60`. RRF uses **ranks, not raw scores**, so it needs no score normalization across incompatible scales — robust and near-parameter-free.

```
dense_results  = vector_search(query, top_k=50)     # semantic
sparse_results = bm25_search(query, top_k=50)        # lexical
fused = rrf(dense_results, sparse_results, k=60)     # → top 50 by fused rank
# then rerank fused top-50 → top-n (§6)
```

**Why hybrid wins:** dense-only quietly misses every query that hinges on an exact string; lexical-only misses every paraphrase. Hybrid covers both and consistently beats either alone on real, messy query mixes. **Failure mode:** dense-only RAG that "works in the demo" then fails the moment a user pastes an error code or part number — the answer exists in a chunk, but no semantic neighbor surfaced it.

## 6. Reranking — the cheapest big precision win

Bi-encoders (your embedding model) encode query and doc **separately** — fast, but they never see them together. A **cross-encoder reranker** feeds `[query, doc]` jointly through a transformer and scores relevance with full cross-attention. Far more accurate, far too slow to run over the whole corpus — so you run it on the **top-k candidates only**.

```
candidates = hybrid_search(query, top_k=50-100)   # cheap, high recall
reranked   = cross_encoder.rank(query, candidates) # expensive, high precision
context    = reranked[:5-10]                        # top-n to the LLM
```

- **Retrieve wide (k=50–100), rerank to narrow (n=3–10).** This is the standard two-stage funnel: recall from retrieval, precision from reranking.
- **Impact:** reranking typically lifts retrieval precision/NDCG by **10–40%** and is the single highest-ROI add after hybrid. It rescues relevant docs that ranked 20th into the top 3.
- **Latency:** adds **50–300ms** for ~50 candidates (a hosted rerank API or a small local model). Negligible next to the 1–10s generation step.
- **Models:** Cohere Rerank 3, Voyage rerank-2, BGE-reranker-v2, Jina reranker, or any MS-MARCO cross-encoder (`ms-marco-MiniLM-L-6-v2` for a fast local baseline).
- **When to skip:** trivially small corpora, or hard latency budgets <100ms total. For nearly everything else, **add it** — it's the best precision-per-effort lever in RAG.

**The funnel, with numbers:** retrieve **k=50–100** (cheap, ANN, ~20ms) → rerank to **n=3–10** (cross-encoder, ~100ms) → generate (~3s). Widening k costs the retriever almost nothing but gives the reranker more chances to surface a buried gem; the reranker is what makes a wide-but-noisy candidate set safe to pass downstream. Tune k up until reranked precision stops improving, then stop.

## 7. Query processing — fix the query before you search

The user's raw query is often a bad search query (vague, multi-part, full of pronouns, or just badly phrased). Transform it first.

| Technique | What | When |
|---|---|---|
| **Rewriting** | LLM cleans/normalizes the query; resolves "it/that" from chat history into standalone form | Conversational RAG (mandatory — "what about the second one?" is unsearchable raw) |
| **Expansion** | Add synonyms / related terms | Sparse retrieval, jargon mismatch |
| **HyDE** | LLM writes a *hypothetical answer*, embed **that** (answers look like docs, not questions), search with it | Zero-shot / asymmetric mismatch; costs one LLM call |
| **Multi-query** | LLM generates 3–5 query variations, retrieve each, union + dedup | Improves recall on ambiguous queries |
| **Decomposition** | Split a compound question into sub-questions, retrieve per sub, combine | Multi-hop ("compare A's revenue to B's") |
| **Routing** | Classify query → pick index/tool/filter (docs vs code vs SQL vs "no retrieval needed") | Multiple sources; avoid retrieving when the model already knows |

**Conversational rewrite example** (why it's mandatory):
```
History: "How do I export my data?" → "It's under Settings → Export."
User:    "Can I schedule that?"
Raw embed of "Can I schedule that?" → matches calendars, meetings — wrong.
Rewritten: "Can I schedule a recurring data export in Settings?" → correct chunks.
```

**Do** always rewrite in multi-turn chat — follow-ups are unsearchable without history. **Don't** stack every technique blindly; each adds latency and LLM cost. Add one, measure recall, keep if it helps.

## 8. Freshness & indexing ops — the index is a living system

A RAG index is not write-once. Sources change; the index must track them or it serves stale, deleted, or wrong content.

- **Incremental updates:** upsert by stable `doc_id`. On change, **delete all old chunks for that doc, then re-chunk and re-insert** — don't append (you'll serve both versions). Diff by content hash to skip unchanged docs.
- **Deletes / tombstones:** when a source is deleted, its chunks **must** leave the index or RAG cites dead content. HNSW deletes are soft (tombstoned, reclaimed on compaction) — schedule compaction or recall degrades and memory bloats.
- **Staleness & TTL:** stamp `indexed_at`; for time-sensitive corpora set a TTL and re-index or expire. Surface document age to the model so it can hedge on old data.
- **Real-time vs batch:** batch (nightly/hourly re-index) is simpler and fine for slow-changing docs. Real-time (event-driven upsert on source change) is needed for live data (tickets, chat, prices) — more infra. Pick by how fast truth changes.
- **Re-index on schema change:** changing chunk size, embedding model (§3), or prefix scheme invalidates the whole index — rebuild, don't patch.
- **Source-of-truth sync:** the source system owns the data; the index is a derived cache. Reconcile periodically (full re-sync or change-data-capture) so drift between source and index can't silently accumulate.

| Change cadence | Strategy | Mechanism |
|---|---|---|
| Static / rarely (policies, manuals) | Full rebuild on release | CI job, versioned index |
| Daily–weekly (docs, KB) | Scheduled incremental | Cron + content-hash diff upsert |
| Minutes (tickets, chat, prices) | Event-driven real-time | CDC / webhook → queue → upsert worker |
| Deletes (any cadence) | Tombstone + compaction | Soft-delete by `doc_id`, scheduled compaction |

**Failure mode:** **stale index** — a doc was updated or deleted in the source weeks ago, but its old chunks still retrieve, so RAG confidently cites information that no longer exists. No prompt fixes this; the indexing pipeline must.

## 9. Context assembly — what actually reaches the model

Retrieval found candidates; assembly decides what enters the prompt and in what order. This stage is cheap to run and easy to get wrong.

- **Top-n selection:** pass the reranked top **3–10** chunks, not the top 50. More context ≠ better — it dilutes signal, costs tokens, and slows generation. Find your n by eval.
- **Dedup:** near-duplicate chunks (same boilerplate, overlapping regions, the same fact from two sources) waste budget and bias the model. Drop by content hash or high mutual similarity.
- **Ordering — lost in the middle:** LLMs attend best to the **start and end** of context and lose information **in the middle** (Liu et al., 2023). Put the **most relevant chunk first or last**, weakest in the middle. Don't dump chunks in retrieval-score order into the middle.
- **Citation metadata:** carry `source`, `title`, `url`, `section` alongside each chunk and instruct the model to cite by ID. Citations are how users (and your evals) verify the answer wasn't hallucinated — non-negotiable for trust.
- **Token budget:** `system + query + (n chunks) + reserved output` must fit the window with margin. Budget explicitly; truncate by reranked relevance, never by arbitrary cutoff. Leave room for the answer.
- **No relevant context → say so:** if retrieval/rerank scores are all below a relevance threshold, **tell the model nothing relevant was found and instruct it to say "I don't know"** — do **not** force weak chunks in. Forcing irrelevant context is the direct cause of confident, sourced hallucination.

**Generation prompt — make grounding and abstention explicit:**

```
Answer ONLY from the <context> below. Each fact must trace to a
chunk; cite its [id]. If the context does not contain the answer,
reply exactly: "I don't have that in my sources." Do not use prior
knowledge. Do not guess.

<context>
[doc-12 §Billing] Refunds are processed within 5–7 business days...
[doc-08 §Billing] To request a refund, open Settings → Billing...
</context>

Question: {query}
```

The instruction to abstain is what converts weak retrieval into an honest "I don't know" instead of a confident fabrication. Pair it with the §9 relevance threshold so the empty-context branch actually fires.

**Failure modes here:** (1) retrieving irrelevant chunks and the model **hallucinates an answer from them** — looks grounded, is wrong; (2) **no "I don't know" path**, so empty/weak retrieval still produces a fabricated answer; (3) lost-in-the-middle burying the one good chunk in position 6 of 10.

## 10. Advanced patterns — reach for these when flat RAG plateaus

- **Graph RAG:** build a knowledge graph (entities + relations) over the corpus; retrieve by traversing the graph plus vectors. Excels at "what connects A and B?" and global/summarization questions a flat index can't answer. Higher build cost (entity extraction); use when relationships matter more than passages.
- **Agentic RAG:** the LLM **decides** whether/what/how to retrieve, can issue multiple searches, reflect on results, and re-query. Turns retrieval into a tool the agent calls in a loop. Handles ambiguity and gaps; costs more LLM calls and latency.
- **Multi-hop RAG:** questions needing chained evidence ("the CEO of the company that acquired X"). Decompose → retrieve hop 1 → use it to form hop 2 → retrieve → combine. Single-shot retrieval structurally cannot answer these.

| Pattern | Answers | Build cost | Query cost | Reach for it when |
|---|---|---|---|---|
| Flat hybrid+rerank | "What does the doc say about X?" | Low | 1 retrieval | Default — start here |
| Graph RAG | "How are A and B connected?" / global summary | High (entity extraction) | Traverse + vector | Relationships > passages |
| Agentic RAG | Ambiguous, gap-filling, iterative | Medium | Many LLM calls | Query needs reflection/retry |
| Multi-hop | "CEO of the firm that bought X" | Medium | k retrievals chained | Chained evidence required |

**Do** exhaust hybrid + rerank + good chunking before adding graph/agentic complexity — they fix most failures at a fraction of the cost. **Don't** build Graph RAG because it's fashionable; build it because your questions are relational.

## 11. Evaluation — you cannot improve what you don't measure

RAG fails silently — a wrong answer looks identical to a right one. Build evals before tuning. **Measure retrieval and generation separately** so you know which half is broken.
- **Retrieval:** recall@k, precision@k, MRR, NDCG against a labeled set of (query → relevant chunk) pairs. If recall@k is low, no prompt or model fixes it — fix retrieval. Target **recall@10 ≥ 0.9** before you bother tuning generation; you can't answer from a chunk you never retrieved.
- **Generation (RAGAS-style):** faithfulness (answer grounded in context?), answer relevance, context precision/recall. Track an **abstention rate** too — a system that never says "I don't know" is hallucinating, not omniscient.
- Maintain a **golden query set** (50–200 real queries with known answers) and run it on every change — chunk size, embedding model, reranker, prompt. Gate merges on no regression. → see the **evals** skill for harness design, LLM-as-judge calibration, and regression gating.

## 12. Failure-mode cheat sheet

| Symptom | Root cause | Fix |
|---|---|---|
| Answer is half-right / cut off | Chunking split it across chunks | Overlap, structural/small-to-big chunks |
| Misses exact IDs, codes, acronyms | Dense-only retrieval | Add BM25 → hybrid + RRF (§5) |
| Relevant doc retrieved but ranked low | No reranking | Add cross-encoder rerank (§6) |
| Cites deleted/outdated content | Stale index | Tombstones, re-index, source sync (§8) |
| Confident answer, wrong facts | Irrelevant context forced in | Relevance threshold + "I don't know" (§9) |
| Always answers, even with no data | No abstention path | Instruct + threshold to say "I don't know" |
| Recall collapsed after model upgrade | Embedding drift (mixed vector spaces) | Re-embed whole corpus, rebuild index (§3) |
| Good chunk ignored by model | Lost in the middle | Reorder most-relevant first/last (§9) |
| Conversational follow-ups fail | Raw query not standalone | Query rewriting with history (§7) |

**The one rule:** retrieval quality is the ceiling on RAG quality. Measure it, make it hybrid, rerank it, keep it fresh, and let the model abstain when it's empty.
