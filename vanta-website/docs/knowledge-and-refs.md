---
id: knowledge-and-refs
title: Knowledge graph & references
sidebar_position: 5
---

# Knowledge graph & references

Two cross-session knowledge stores that complement the [brain](./skills-and-memory.md): a structured graph of facts, and a durable store of ingested references.

## Knowledge graph

A temporal, append-only entity–relationship graph of facts that persist across sessions — "project X uses tool Y", "decided Z last week".

- **Tool:** `graph_query`
- **Store:** `~/.vanta/graph.jsonl`
- **Entities:** person · project · tool · decision · goal · concept · file
- **Relations:** worked-on · decided · depends-on · related-to · learned · part-of · uses (each with a strength score)

Recall is substring match plus direct-relation traversal, so it's good for project archaeology and decision tracing ("why did we pick this?"). Facts are written as the agent learns them and surfaced on later turns.

## References

A durable store of ingested reference material so you never re-paste the same source.

| Tool | Does |
|------|------|
| `ref_ingest` | fetch a URL (via `web_fetch`) or read a file/repo/image/transcript → store an excerpt |
| `ref_search` | query stored refs by title / content / tags |
| `ref_list` | enumerate everything ingested |

Refs live in `~/.vanta/refs/index.json`. Source type is auto-detected; ingesting a URL stores a readable excerpt you can search and cite in later sessions — a persistent per-project knowledge base.

> Both stores are local and git-adjacent under `~/.vanta`. They differ from the brain: the brain is associative/decaying memory; the graph is structured facts; refs are verbatim source excerpts.
