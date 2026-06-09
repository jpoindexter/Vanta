---
name: harness-and-context-engineering
description: Reference-grade guide to the engineering AROUND the model — the control loop, tools, memory, retries, and budgets (the harness) plus context as a dynamically-assembled token budget — covering lost-in-the-middle, context rot, just-in-time retrieval, compaction, sub-agent isolation, prompt-cache-stable ordering, and the agent-loop and eval patterns that actually determine reliability.
tags: [ai-engineering, harness, context-engineering, agents]
---
# Harness & Context Engineering

Prompt engineering optimizes the *string you send the model*. Harness and context engineering optimize *everything else*: the loop that decides when to call the model, the tools it can reach, what gets retrieved and assembled into the window, what gets remembered across turns, how failures retry, and what budgets cap it. In production agent systems the harness — not the prompt — is the dominant lever on reliability. A perfect prompt inside a loop with no retry, no tool error-handling, no token budget, and a stale context will fail; a mediocre prompt inside a disciplined harness ships.

The mental model that organizes this whole skill: **the context window is the model's working memory, and it is a managed budget, not a bucket you fill.** Every token you spend on a tool definition is a token you can't spend on retrieved evidence or conversation history. Context engineering is the discipline of allocating that scarce budget — assembling, ordering, compacting, and evicting — so the *right* tokens are present at the *right* position for *each* model call. This skill is the playbook for both the harness around the model and the context inside it.

Modern sources to anchor on: Anthropic's *Building effective agents* (2024) and *Effective context engineering for AI agents* (2025); the "lost in the middle" finding (Liu et al., *TACL* 2024); Chroma's *Context Rot* report (2025); the ReAct loop (Yao et al., 2022); and the prompt-caching mechanics from the major providers (cross-reference the **prompt-caching** skill for the cache-specific depth).

---

## 1. Harness engineering vs prompt engineering

| | Prompt engineering | Harness engineering |
|---|---|---|
| Unit of work | The text in one request | The code around every request |
| Optimizes | Phrasing, examples, format, role | Loop, tools, retries, budgets, memory, routing |
| Failure it fixes | "model misunderstood the instruction" | "model called a broken tool and the loop hung" |
| Tested by | eval on prompt variants | integration tests on the control loop + failure injection |
| Owns reliability | a little | most of it |

The harness is the deterministic scaffolding: a state machine that calls the model, parses its output, dispatches tools, handles tool errors, enforces a step/token/wall-clock budget, decides when to stop, and assembles the next context. The prompt is one input to one node of that machine.

**Why the harness dominates reliability.** LLM calls are non-deterministic, occasionally malformed, and bounded by a finite window. The harness is where you make a non-deterministic component behave like a dependable one: validate every output, retry transient failures, degrade gracefully when a tool 500s, cap runaway loops, and keep the window coherent over long horizons. None of that lives in the prompt. The single highest-leverage realization for a team that has been "prompt-tuning" for weeks: most of your remaining failures are harness bugs wearing a prompt costume.

```
loop(goal, ctx):
  for step in range(MAX_STEPS):
    if budget.exceeded(): return halt("budget")
    msg   = model(assemble_context(ctx))          # one call
    plan  = parse_or_repair(msg)                   # validate; reprompt on schema miss
    if plan.is_final: return plan.answer
    obs   = dispatch_tool(plan.tool, plan.args)    # adapter: timeout, retry, error-as-value
    ctx   = update_context(ctx, plan, obs)         # append + compact if near budget
  return halt("max_steps")
```

Everything interesting in production is in `parse_or_repair`, `dispatch_tool`, `assemble_context`, `update_context`, and `budget` — not in `model`.

---

## 2. Context is a budget, not a long prompt

A "long prompt" is a static blob you author once. **Context** is the full set of tokens present for a given model call, dynamically assembled from distinct, separately-governed sources:

| Component | What it is | Volatility | Budget instinct |
|---|---|---|---|
| System / instructions | role, policy, output contract | stable (cache-friendly) | small, fixed |
| Tool definitions | names, descriptions, schemas | stable per-session | medium; prune unused tools |
| Retrieved knowledge | RAG hits, file slices, docs | per-step, just-in-time | largest swing; relevance-gated |
| Conversation history | prior turns, tool results | grows unbounded | compact aggressively |
| Scratchpad / plan | the agent's working notes | per-step | keep current, evict stale |
| User message | the actual ask | per-turn | verbatim |

Context engineering is the policy that decides *how many tokens each component gets, in what order, on each call.* The opposite — concatenating everything you have "just in case" — is the central anti-pattern. More tokens is not more capability; past a point it is **less**, for three measured reasons below.

**Don't** treat the window as free because the model "supports 200K." Supporting a window size is not the same as reasoning well across it. Treat every token as paid-for working memory.

---

## 3. The three degradation effects (why volume hurts)

These are empirical, named, and reproducible. Design against them.

### Lost in the middle
- **Finding:** Liu et al., *Lost in the Middle* (TACL 2024). Retrieval/QA accuracy is highest when the relevant passage sits at the **start or end** of the context and sags measurably when it's buried in the middle — a U-shaped curve, even on models advertised as long-context.
- **Design rule:** Put the most decision-critical material at the **top** (stable system + task framing) and the **bottom** (the immediate question, the freshest retrieved evidence). Never bury the one paragraph that matters at 50% depth inside 80K tokens of filler.
- **Pitfall:** Dumping a sorted-by-database-order document set and assuming the model will find the needle. Rank by relevance and place top hits at the edges.

### Context rot
- **Finding:** Chroma's *Context Rot* (2025): as input length grows, performance on the *same* task degrades even when the needed information is fully present — distractors, length, and irrelevant tokens erode reasoning. Long context is not a free lunch you pay for only in latency.
- **Design rule:** Fewer, higher-relevance tokens beat more, lower-relevance ones. Aggressively drop near-duplicate retrievals and resolved tool chatter.
- **Pitfall:** "We have headroom, so include all 40 search results." The 35 weak results actively poison the 5 strong ones.

### Position / recency effects
- Models weight the **most recent** tokens heavily (recency) and the **earliest** instruction tokens (primacy). Mid-context instructions get diluted.
- **Design rule:** Restate the binding constraint near the *end* of the prompt right before the model must act ("Given the above, do X. Output only valid JSON matching the schema."). The system prompt sets policy; the tail enforces it.

**Relevance over volume** is the through-line of all three. The job is not "fit more in" — it's "put exactly what's needed where it's read best, and nothing else."

---

## 4. Just-in-time retrieval vs front-loading

Two strategies for getting knowledge into context:

- **Front-loading (eager):** stuff all plausibly-relevant docs in at the start of the task. Simple; wastes budget; triggers rot; goes stale as the task pivots.
- **Just-in-time (lazy / agentic retrieval):** keep lightweight *references* (file paths, IDs, summaries, tool handles) in context and let the agent *fetch* the full content with a tool **at the moment it's needed.** This is how a coding agent works — it doesn't preload the repo; it `grep`s and `read`s on demand.

JIT wins for agents because the agent's own actions reveal what's relevant, and you pay tokens only for what's actually used. Anthropic's context-engineering guidance frames this as "let the agent retrieve as it goes" rather than pre-deciding. The cost is more round-trips (latency) and a smarter loop.

**Hybrid (recommended default):** front-load a small, high-certainty core (the task spec, a directory map, the 2-3 docs you *know* are needed) and JIT everything speculative. Keep a "context manifest" — a compact index of what's *available* to fetch — so the model knows what it can reach without the content being resident.

```
# manifest stays in context; bodies are fetched on demand
manifest = [
  {id: "spec",   tokens: 800,  resident: true},
  {id: "api.md", tokens: 4000, resident: false, fetch: read("docs/api.md")},
  {id: "schema", tokens: 1200, resident: false, fetch: read("db/schema.sql")},
]
```

---

## 5. Compaction, summarization, and eviction

Conversation and tool output grow without bound; the window does not. You need a **pruning/eviction policy**.

Techniques, cheapest to richest:
1. **Truncation** — drop oldest turns. Fast, lossy, loses early decisions. Use only with a durable memory backstop.
2. **Sliding window + pinned head** — keep the system prompt + first task framing *pinned*, slide a window over recent turns. Preserves goal and recency; loses the middle (acceptable — see §3).
3. **Rolling summarization (compaction)** — when history nears a high-water mark (e.g., 70% of budget), replace the oldest N turns with a model-written summary that preserves decisions, open questions, key facts, and discarded options. This is the workhorse for long agent runs.
4. **Structured state extraction** — instead of summarizing prose, maintain a typed state object (decisions made, files touched, current plan, blockers) updated each step. The model reads the state, not the transcript. Most robust; most engineering.

**Eviction policy checklist:** pin the system prompt and active goal; summarize resolved sub-tasks; drop verbose tool *outputs* once their *conclusion* is captured (keep "the query returned 3 rows: X, Y, Z," drop the 2K-token raw dump); never evict the immediate question.

**Do** compact at a threshold and log what was dropped. **Don't** let history grow until the provider hard-truncates it silently — you lose control of *what* is lost (usually the head, your most important tokens).

A concrete compaction trigger:
```
if tokens(history) > 0.7 * BUDGET:
  old, recent = split(history, keep_recent=8)
  summary = model(SUMMARIZE_PROMPT, old)   # decisions, facts, open Qs, dead-ends
  history = [pinned_goal, summary, *recent]
```

---

## 6. Sub-agent context isolation

A single agent accumulating one giant context across a 50-step task hits rot and lost-in-the-middle. **Sub-agents** (orchestrator + workers) are a context-engineering pattern as much as a parallelism one:

- Each sub-agent gets a **clean, scoped context**: only the sub-task spec and the references it needs. It does deep work in its own window — burning tokens freely — then returns a **compact result** (an answer, a diff, a summary), not its whole transcript.
- The orchestrator's context stays lean: it holds the plan and the *distilled* outputs of workers, never their raw exploration. This is how Anthropic's multi-agent research system scales — workers explore in isolation, the lead synthesizes condensed findings.

**When to reach for it:** the task decomposes into independent chunks (research N sources, refactor M files), each of which would otherwise flood the main context with intermediate junk. **When not to:** tightly-coupled sequential work where the handoff cost (re-establishing context per worker) exceeds the savings, or where shared state makes isolation a lie.

**Handoff discipline:** define the worker's return contract narrowly. "Return: the chosen approach (1 paragraph), the 3 files changed, and any blocker." A worker that returns its full scratchpad has defeated the isolation.

```
plan = orchestrator(goal)                       # lean context
results = parallel(
  worker(sub, scoped_ctx(sub)) for sub in plan  # each: isolated window
)                                               # returns: condensed, not transcript
answer = orchestrator(synthesize(plan, results))
```

---

## 7. Token budget management & allocation

Make the budget explicit and enforced — not an afterthought the provider enforces for you.

A workable default allocation for a long-context agent (tune per task):

| Component | Target share | Hard cap behavior |
|---|---|---|
| System + tools | 5-15% | fixed; if tools blow this, prune the tool list |
| Conversation / state | 20-40% | compaction trigger at threshold |
| Retrieved evidence | 30-50% | relevance-ranked; truncate tail hits first |
| Scratchpad / plan | 5-15% | evict stale steps |
| Response headroom | reserve `max_tokens` | never let input crowd out the answer |

Rules:
- **Reserve output space first.** `input_budget = context_limit − max_output_tokens − safety_margin`. Running the input to the brim leaves no room to answer and risks truncated tool calls.
- **Measure, don't guess.** Count tokens per component with the model's tokenizer before each call; log the breakdown. You cannot manage a budget you don't measure.
- **Prune in priority order:** evidence tail → resolved tool outputs → old turns (via summary) → never the goal or the immediate question.
- **Degrade visibly.** When you must drop content, leave a marker ("[earlier history summarized]") so the model knows information was elided rather than never existed.

---

## 8. Tools and function definitions ARE context

Every tool you expose costs tokens (its name, description, JSON schema) *and* cognitive load (more tools = harder routing, more wrong-tool errors — Hick's Law for models). Tool design is context design.

- **Descriptions are prompts.** "Searches." is useless. "Searches the indexed codebase for a symbol by exact name; returns file path, line, and signature. Use for 'where is X defined', not for free-text content search (use grep_text for that)." — tells the model *when* to pick it and when not to.
- **Schemas constrain output.** A tight JSON schema with enums and required fields turns "hope it returns valid args" into "it returns valid args or fails validation you can re-prompt on." Validate every tool call against its schema; on failure, return the validation error *as the tool result* so the model self-corrects.
- **Fewer, sharper tools beat many overlapping ones.** Two tools whose descriptions both plausibly match a request guarantee wrong-tool selection. Merge or disambiguate. If you have 30 tools, the model spends budget *and* attention choosing; consider tool-retrieval (expose only the relevant subset per task).
- **Return *information*, not dumps.** A tool that returns 5K tokens of raw JSON forces a downstream summarization step. Return the distilled, agent-useful slice; offer a "fetch full detail" follow-up tool for the rare case.
- **Errors as values.** A tool that throws crashes the loop; a tool that returns `{ok:false, error:"file not found: X. Did you mean Y?"}` lets the model recover within the loop. Make tool errors actionable strings, not stack traces.

**Do:** name tools by action, document the *boundary* between similar tools, validate args, return concise results. **Don't:** expose every internal function, write one-word descriptions, or let a tool throw across the loop boundary.

---

## 9. Memory tiers feeding context

Context is ephemeral (one window); memory is durable (across turns and sessions). A tiered memory system is what lets a finite window behave like unbounded recall. Each tier has a distinct read path into context.

| Tier | Holds | Lifetime | How it enters context |
|---|---|---|---|
| **Working** | current goal, plan, active step | this task | resident, pinned |
| **Scratchpad** | intermediate reasoning, draft results | this task | resident; evicted when stale |
| **Episodic** | what happened in past sessions/turns | across sessions | retrieved by recency/relevance |
| **Semantic** | distilled facts, preferences, learned rules | long-term | retrieved by similarity; small, high-value |

- **Working + scratchpad** are *in* the window. Keep them current; that's where compaction (§5) operates.
- **Episodic** ("last session we decided X, the build failed on Y") is retrieved JIT — don't preload the entire history, fetch the relevant episode.
- **Semantic** ("the user prefers ESM, the API base is Z") is the smallest and most valuable; a handful of stable facts that belong near the top.

**Anti-pattern:** treating the conversation transcript as your only memory. When the window compacts, undocumented decisions vanish. Externalize durable facts to semantic memory *as they're decided*, so compaction is lossless for what matters.

---

## 10. Multi-turn state, history compression, handoffs

- **State over transcript.** For long sessions, maintain an explicit typed state object (goal, decisions[], files_touched[], open_questions[], next_step) updated each turn. The model reads the *state*; the raw transcript is compacted behind it. State is compressible, queryable, and survives `/clear`-style resets.
- **History compression** is §5 applied per-turn: as turns accumulate, fold old ones into the state object or a running summary. The compression *prompt* is itself engineered — tell it explicitly to preserve decisions, open questions, and rejected alternatives (so the agent doesn't re-litigate dead ends).
- **Handoffs** (session→session, agent→agent, model→model) are state serialization. A good handoff artifact contains: the goal, what's done, what's in-flight, decisions locked, blockers, and the single next action — *not* the transcript. This is the same contract whether you're handing to a fresh window, a sub-agent, or a teammate. (See the **managing-context-window** skill for the human-facing version of this.)

---

## 11. Structured context, ordering, and cache-stable prefixes

How you *format* and *order* context changes both quality and cost.

- **Structure with delimiters.** Wrap distinct sections in XML-ish tags or clear headers: `<system_policy>`, `<task>`, `<retrieved_docs>`, `<conversation>`, `<output_contract>`. Models attend better to delimited, labeled blocks than to a wall of prose, and you can address sections ("using only `<retrieved_docs>`, …"). Anthropic models in particular respond well to XML tags.
- **Order for attention (§3):** stable policy at top, immediate question and freshest evidence at the bottom.
- **Order for caching:** prompt caches key on a **stable prefix.** Put everything constant (system prompt, tool definitions, static few-shot examples) **first and byte-identical across calls**; put everything variable (retrieved docs, the user turn, scratchpad) **after** the cache breakpoint. A single changed token early in the prefix invalidates the entire downstream cache — so never interleave a timestamp, a per-call ID, or freshly-retrieved content into the static head. This is the load-bearing link to the **prompt-caching** skill: context *ordering* is what makes caching possible, and caching is what makes long stable contexts affordable (5-10x cost / latency reduction on the cached prefix).

```
[ STABLE PREFIX — cached ]            [ VARIABLE SUFFIX — not cached ]
 system policy                         retrieved docs (this step)
 tool definitions          ──cache──►  conversation tail
 static few-shot examples   breakpoint user message
                                       "Given the above, do X."
```

**Anti-pattern that silently doubles cost:** putting a per-request timestamp, request ID, or "today's date" at the very top of the system prompt. It changes every call, so the cache never hits. Move volatile values *below* the breakpoint.

---

## 12. Agent loop design: plan / act / observe and termination

The control loop is the heart of the harness. The canonical pattern is **ReAct** (Yao et al., 2022): interleave reasoning ("Thought"), tool calls ("Act"), and tool results ("Observation") in a loop until a final answer.

```
Thought:  I need the user's last order date.
Act:      query_db(sql="SELECT max(date) ...")
Obs:      2026-05-30
Thought:  That's within 7 days, so they're eligible.
Act:      final_answer("Eligible — last order 2026-05-30.")
```

Design decisions that determine whether the loop is reliable:

- **Plan-first vs react-as-you-go.** For well-scoped tasks, have the model emit a *plan* up front (cheap, keeps it on-rails), then execute. For open-ended exploration, pure ReAct adapts better. Hybrid: plan, then react within each step, re-plan if observations contradict the plan.
- **Termination — get this right or burn money.** Stop on: explicit `final_answer` tool call (preferred — unambiguous), a max-steps cap, a token/wall-clock budget, or a repeated-state detector (same tool + same args twice = stuck loop, break). **Never** rely solely on the model "deciding it's done" in prose — parse a structured terminal signal.
- **Loop/stall detection.** Track recent (tool, args) tuples; if the agent repeats an action with no new observation, it's looping — inject a "you repeated X with no progress; try a different approach" nudge or halt. (This is the harness-level analog of set-shifting.)
- **Output validation + repair.** Every model output is parsed against the expected shape; on a malformed tool call, re-prompt with the parse error rather than crashing. Budget a small number of repair attempts before failing the step.
- **Retries with backoff** for *transient* failures (rate limit, 5xx, timeout) — distinct from *logical* failures (tool says "not found"), which go back to the model as observations, not retried blindly.

**Termination table:**

| Stop reason | Detect by | Action |
|---|---|---|
| Task complete | `final_answer` tool call | return answer |
| Step budget | step counter ≥ MAX | halt + summarize progress |
| Token/time budget | running meter | halt gracefully, return partial |
| Stuck loop | repeated (tool,args) | nudge once, then halt |
| Unrecoverable tool error | error after retries | surface to user, don't fake success |

---

## 13. Evaluating context quality

You can't improve what you don't measure. Evaluate the *context assembly*, not just the final answer.

- **Context precision / recall.** Of the chunks you put in context, what fraction were actually needed (precision)? Of the chunks needed, what fraction made it in (recall)? Low precision → you're stuffing (rot risk). Low recall → your retrieval misses (wrong-answer risk). RAGAS-style metrics formalize this.
- **Needle-in-a-haystack** tests at *your* working context length, with *your* distractors — provider NIAH scores use clean synthetic context and overstate real performance (this is exactly what Context Rot measures). Test retrieval at the position depths you actually use.
- **Faithfulness / groundedness.** Does the answer cite only what was in context, or hallucinate beyond it? A grounded answer that's wrong is a retrieval bug; an ungrounded answer is a prompt/guardrail bug.
- **Ablations.** Remove a context component (the few-shot block, the JIT docs) and measure the accuracy delta. If removing it doesn't hurt, it was pure budget waste — cut it.
- **Trace-level eval.** For agents, score the *trajectory*: were the right tools called, in a sensible order, without loops? Final-answer-only eval hides loop and tool-selection bugs.

---

## 14. Production failure modes (and the fix)

| Failure mode | Symptom | Fix |
|---|---|---|
| **Stuff-everything context** | Slow, expensive, *worse* answers as you add docs | Relevance-rank + cap; ablate components; JIT retrieval |
| **No compaction** | Long sessions silently truncate the system prompt | Pin head, summarize at threshold, log evictions |
| **Unstable cache prefix** | Cost/latency never drops despite caching enabled | Move all volatile tokens below the cache breakpoint |
| **Retrieve by volume** | Top-k=40, accuracy drops | Tune k down, add a relevance threshold, rerank |
| **No token budget** | Provider hard-truncates the *wrong* end (the head) | Explicit budget, reserve output space, control eviction |
| **Tool throws across loop** | One bad tool call kills the whole agent | Errors-as-values; validate args; retry transient only |
| **No termination signal** | Agent loops, burns tokens, never stops | `final_answer` tool + max-steps + stuck-loop detector |
| **Lost in the middle** | Needed fact present but ignored | Place critical content at top/bottom, restate at tail |
| **Transcript-as-memory** | Compaction loses a locked decision | Externalize durable facts to semantic memory as decided |
| **Mega-agent context** | One agent's 50-step run rots | Sub-agent isolation; condensed handoffs |

---

## 15. Decision checklist

Before shipping an agent, confirm the harness — not the prompt — answers each:

- [ ] Is there an explicit token budget per component, with output space reserved and per-call measurement?
- [ ] Does the most critical content sit at the top and bottom of the window (not the middle)?
- [ ] Is retrieval relevance-gated (threshold + rerank), or are you stuffing top-k?
- [ ] Is there a compaction trigger with a summary that preserves decisions and dead-ends?
- [ ] Is the cache prefix byte-stable (no timestamps/IDs in the static head)? (→ **prompt-caching** skill)
- [ ] Are tools validated, error-as-value, and described with their *boundary* vs siblings?
- [ ] Does the loop have a structured terminal signal, a step/budget cap, and stuck-loop detection?
- [ ] Are durable facts externalized to memory so compaction is lossless for what matters?
- [ ] Do sub-agents return condensed results, not transcripts?
- [ ] Do you eval context precision/recall and trajectory — not just the final answer?

The prompt is the last 5% of the work. The harness and the context budget are the other 95%, and they are where reliability is won or lost.
