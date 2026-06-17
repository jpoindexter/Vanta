# The Anatomy of an Agent Harness — extract

Source: Akshay Pachaar, *The Anatomy of an Agent Harness* (X/Twitter long-form article, Apr 2026). A practitioner synthesis across Anthropic (another agent), OpenAI (Codex/Agents SDK), LangGraph/LangChain, CrewAI, AutoGen. Companion to the academic paper (`the harness paper notes`); the `HARNESS-*` cards extract the items that paper's `PAPER-*` cards don't already cover.

Thesis: *"If you're not the model, you're the harness."* The harness is the complete non-model infrastructure (orchestration loop, tools, memory, context, state, guardrails) that turns a stateless LLM into an agent. LangChain moved from outside-top-30 to rank 5 on TerminalBench 2.0 by changing **only** the harness (same model). TAB Platform: same model scored 42% with one harness, 78% with another.

## The 12 components
1. **Orchestration loop** — TAO/ReAct "dumb loop, intelligence in the model"; complexity is in what the loop *manages*.
2. **Tools** — schemas + registration + validation + sandboxed exec + result formatting; 6 categories (file, search, execution, web, code-intelligence, subagent-spawning).
3. **Memory** — 3-tier: index (~150 chars/entry, always loaded) · detail files (on demand) · raw transcripts (search only). Principle: *memory is a hint, verify against actual state before acting.*
4. **Context management** — context rot: 30%+ degradation when key content sits mid-window ("Lost in the Middle"). Strategies: compaction · **observation masking** (hide old tool outputs, keep tool calls) · **just-in-time retrieval** (grep/glob/head/tail, not full files) · subagent delegation.
5. **Prompt construction** — hierarchical priority stack (system → tools → memory → history → user).
6. **Output parsing** — native tool-calling; schema-constrained outputs.
7. **State management** — Claude: git commits as checkpoints + progress files as structured scratchpads.
8. **Error handling** — 10 steps @ 99%/step = 90.4% end-to-end; 4 error types (transient/retry, LLM-recoverable, user-fixable, unexpected); Stripe caps retries at 2.
9. **Guardrails & safety** — input/output/tool guardrails + tripwire; Claude gates ~40 tools independently in 3 stages (trust at load, permission per call, confirm high-risk). *Comment gap: missing memory-level guardrails (freshness, conflict, provenance).*
10. **Verification loops** — rules-based (tests/linters/types) · visual (screenshots via Playwright) · LLM-as-judge subagent. *"Verify improves quality 2–3×" (Boris Cherny).*
11. **Subagent orchestration** — Fork / Teammate / Worktree; agents-as-tools vs handoffs.
12. **Lifecycle management** — (the implied 12th) startup/shutdown, resume, cross-session continuity.

## The Ralph Loop (long-running, multi-context-window tasks)
Two-phase: an **Initializer Agent** sets up the env (init script, **progress file**, **feature list**, initial git commit); then a **Coding Agent** in *every subsequent session* reads git logs + progress files to orient, picks the **highest-priority incomplete feature**, works on it, commits, and writes a summary. **The filesystem provides continuity across context windows** — the agent re-derives "where was I" from durable state, not a carried transcript. (Directly relevant to Vanta's startup-continuity: resume-or-drop the last task from a progress file rather than always inheriting it.)

## Seven decisions that define every harness
1. Single vs multi-agent (maximize single first; split only at >10 overlapping tools / separate domains).
2. ReAct vs plan-and-execute (LLMCompiler ~3.6× speedup).
3. Context strategy (ACON: 26–54% token reduction at 95%+ accuracy by prioritizing reasoning traces over raw tool outputs).
4. Verification design (computational/ground-truth vs inferential/LLM-judge; "guides" feedforward vs "sensors" feedback).
5. Permission/safety (permissive/auto vs restrictive).
6. **Tool scoping** (more tools = worse; Vercel −80% tools improved results; Claude 95% context reduction via lazy loading; expose the minimum tool set per step).
7. **Harness thickness** (thin vs thick; co-evolution — models are post-trained with specific harnesses; Anthropic regularly *deletes* planning steps as models internalize them).

## Co-evolution + future-proofing
Scaffolding is removed when the building is complete; harness complexity should *decrease* as models improve (Manus rebuilt 5×, each removing complexity). **Future-proofing test:** if performance scales up with stronger models *without* adding harness complexity, the design is sound. Implication for Vanta: periodically prune harness scaffolding rather than only adding it.
