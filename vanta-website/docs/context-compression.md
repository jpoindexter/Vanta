---
id: context-compression
title: Context compression (winnow)
sidebar_position: 7
---

# Context compression (winnow)

Agents burn tokens on fat tool output — JSON dumps, logs, file reads, search results, conversation history. Vanta compresses that text *before* it reaches the model with **[winnow](https://github.com/jpoindexter/winnow)**, a local-first compression engine with zero runtime dependencies. It cuts tokens by **40–95%** while keeping the signal, is **content-aware**, **reversible** (originals are recoverable on demand), and runs entirely on your machine — no proxy, no API key, no egress.

winnow is its own MIT-licensed project; Vanta consumes it as a library and wires it into the agent loop.

## It runs automatically

You don't invoke it. Every tool result passes through `compressOutput` in the agent loop, and conversation history is compacted the same way during long sessions.

- **On by default** — set `VANTA_COMPRESS=0` to disable all tool-output compression.
- **Only shrinks output that's large enough** (above a size threshold) and the right shape. Small or genuinely unique text passes through **untouched** — winnow hands it back rather than mangling it.
- **Never lossy on precision reads.** The compressors that elide content are an *allow-list*, not a deny-list, so a raw `grep`/`read_file`/diff is never silently corrupted.

How a result is routed:

| Tool output | What happens |
|---|---|
| `read_file` (TS/JS) | AST skeleton — every signature/type/import kept, bodies elided (recoverable) |
| `read_file` (large JSON) | lossless **TOON** table view (every row kept); exact bytes stashed for retrieval |
| `grep` / search | lossless **densify** — collapses noise, preserves every `file:line` byte |
| object-array tool output | lossless **TOON** table (keys once, one record per row) |
| allow-listed tools | content router — JSON crush, log squash, repeated-block dedupe |
| everything else | returned unchanged |

## Real-headroom guard

Conversation compaction is judged by the next real provider input-token count, not only by how much message text appeared to shrink. This matters when the system prompt and tool schemas form a large fixed floor that message rewriting cannot reduce.

After a changed automatic compaction pass, Vanta waits for the provider's input usage (or its exact preflight token count):

- Below the active trigger restores headroom and resets the episode.
- At or above the trigger records an ineffective strike.
- Two ineffective passes suppress further automatic compaction for that conversation.
- A triggered pass that changes nothing counts as ineffective immediately.
- Missing or zero usage falls back to the existing estimated-savings guard; it does not claim that headroom was restored.

Start a fresh session to reset the episode, or use `/compact <focus>` for an explicit manual compaction. Automatic suppression does not block that manual command.

## Lossy inline, lossless on demand

The core contract: compression shrinks the **inline** view, but the full original is stashed locally under a content id. When the model needs detail it calls `retrieve_original` and gets the exact bytes back. A 200-row array becomes a head + tail sample inline — and row 137 is one retrieve away.

winnow is built on three ideas:

1. **Content-aware, lossy-but-reversible.** Different compressors for JSON, logs, code, and binary; every original recoverable.
2. **Delivery is backbone-gated.** Strong models get a short preview + a retrievable pointer; small/distilled models get a larger inline window and aren't handed a pointer they won't follow.
3. **Cache-aligned.** A volatile segment (a clock, "current" state) early in a prompt invalidates the provider's KV cache every turn — winnow keeps the stable prefix leading so the cache survives.

## Tuning

All of these are opt-in except the master switch:

| Env var | Default | Effect |
|---|---|---|
| `VANTA_COMPRESS` | **on** | master switch; `0` disables all tool-output compression |
| `VANTA_TOON_READFILE` | **on** | TOON view for large JSON file reads; `0` disables |
| `VANTA_TOON_DICT` | off | columnar (dictionary) TOON — bigger lossless savings on low-cardinality tables, at some readability cost |
| `VANTA_PRUNE_CONTEXT` | off | LLMLingua-style score-and-drop prune on oversized inline context |
| `VANTA_WINNOW_LOGPROB` | off | real logprob/surprisal scoring for prune (needs a logprob endpoint) |
| `VANTA_PRUNE_PROVIDER` | — | provider for the prune scorer |
| `VANTA_SKILL_DISTILLED` | off | serve distilled (worked-example) skill bodies |
| `VANTA_SKILL_SUBSET` | off | serve a task-relevant subset of skills |

## Use winnow standalone

winnow works outside Vanta — as a library, a CLI, or an MCP server. It's distributed from GitHub (not the npm registry — the `winnow` name there is an unrelated package).

```bash
npx github:jpoindexter/winnow bench       # try the fidelity benchmark, no install
npm install github:jpoindexter/winnow     # add it to a project
```

```ts
import { compress, retrieve, stats } from "winnow";

const r = await compress(hugeJsonOrLog);   // { text, compressed, originalId, ... }
console.log(stats(hugeJsonOrLog, r.text)); // { tokensBefore, tokensAfter, tokensSaved, ratio }
const original = await retrieve(r.originalId!); // exact bytes, on demand
```

The benchmark measures the honest number — what survives compression **inline**, without a retrieval round-trip:

```
winnow fidelity — 7 cases
  json-head    json  save  86%  inline ✓
  json-tail    json  save  86%  inline ✓
  json-middle  json  save  86%  inline · (recoverable)
  wide-table   json  save  97%  inline · (recoverable)
  log-error    logs  save  99%  inline ✓
  log-dupes    logs  save  99%  inline ✓
  text-prose   text  save   0%  inline ✓

avg savings: 79%   inline needle survival: 71%
recoverable fidelity: 100% (every elided original is retrievable from the store)
```

**Repo:** [github.com/jpoindexter/winnow](https://github.com/jpoindexter/winnow)
