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

### One-message context references

In the local composer or an allowlisted gateway conversation, add bounded project context
directly to a message:

```text
Review @file:src/server.ts:40-90 with @diff and @git:2
Compare @folder:src/auth with @url:https://example.com/spec
```

Supported forms are `@file:path[:start-end]`, `@folder:path`, `@diff`, `@staged`,
`@git:N`, and `@url:https://...`. Vanta expands them before the turn and returns a receipt
listing expanded sources and warnings. File and folder references stay inside the active
project root, binary and sensitive files are refused, and the aggregate character budget is
derived from the routed model's context window. Remote messages keep the profile, root, and
budget they had when received, including while queued.

These references are transient context for one message. Use the durable reference store below
when material should remain searchable across sessions.

A durable store of ingested reference material so you never re-paste the same source.

| Tool | Does |
|------|------|
| `ref_ingest` | fetch a URL (via `web_fetch`) or read a file/repo/image/transcript → store an excerpt |
| `ref_search` | query stored refs by title / content / tags |
| `ref_list` | enumerate everything ingested |

Refs live in `~/.vanta/refs/index.json`. Source type is auto-detected; ingesting a URL stores a readable excerpt you can search and cite in later sessions — a persistent per-project knowledge base.

> Both stores are local and git-adjacent under `~/.vanta`. They differ from the brain: the brain is associative/decaying memory; the graph is structured facts; refs are verbatim source excerpts.

## Corpus compiler

The corpus compiler is the visible workflow for making a folder of Markdown notes,
downloaded `.vtt`/`.srt` transcripts, text files, or an approved public URL searchable:

```bash
vanta corpus ingest ./interviews
vanta corpus recall "Atlas launch receipt"
vanta corpus status
vanta corpus refresh all
```

Corpus data lives in `~/.vanta/corpus/index.json`. Each source keeps its original path or
URL, source date, content hash, ingest/refresh timestamps, freshness window, entity links,
chunks, and any embeddings available at ingest time. Recall fuses BM25 keyword ranking,
semantic similarity when an embedding backend is available, and entity-link ranking. The
printed `Signals` line lists only signals actually used; each result includes a
source/date/freshness receipt.

Local ingest accepts `.md`, `.markdown`, `.txt`, `.vtt`, and `.srt`, skips hidden paths and
unsupported files, and refuses symbolic-link inputs. URL ingest is checked by Vanta's SSRF
and egress policy before it is fetched. `status` identifies stale material and `refresh`
re-reads the original local path or URL.

Export to an Obsidian-compatible vault is preview-first:

```bash
vanta corpus vault-export --vault ~/Documents/Notes
vanta corpus vault-export --vault ~/Documents/Notes --apply
```

The export writes raw source pages under `raw/corpus/`, linked source pages under
`wiki/corpus/`, and entity wiki-links without altering the corpus index.
