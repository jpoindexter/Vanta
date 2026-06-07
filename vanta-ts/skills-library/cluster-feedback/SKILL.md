---
name: cluster-feedback
description: "Cluster feedback / complaints from a source (Reddit, X, a support inbox) into ranked themes - one verbatim quote + 'what they want' each - and report the delta vs the last run."
created: 2026-06-07
updated: 2026-06-07
tags: [feedback, complaints, clustering, themes, research, support, voice-of-customer, loop]
---

# Cluster Feedback

Boris's "cluster Twitter feedback every 30 min" — the smallest, highest-leverage starter loop. Point it at any source. Read `standing-loops` first.

## When to use

"What are people complaining about", "cluster the feedback", recurring voice-of-customer. Swap the source freely: a subreddit, an X search, a support inbox (Gmail MCP), a local CSV export.

## Procedure

1. **Pull items since the last run** from `<source>` — `web_search`/`web_fetch` for public sources, the relevant MCP for an inbox, `read_file` for a local export. Track the high-water mark so each run only sees new items.
2. **Group into themes.** Rank by volume.
3. **Per theme:** one **verbatim** quote + a one-line "what they want". Verbatim — never paraphrase the evidence.
4. **Delta vs the last run:** new / growing / faded themes.

## Output

Write the digest to a note — `write_file` to a local file, or Drive via MCP. Nothing new -> "no movement", end.

## Guardrails

Read-only on the source. Quote real items — **never invent a complaint**. If the source can't be reached, say so; don't synthesize feedback that wasn't there.

## Run it

- Recurring: `vanta schedule "cluster new complaints from <source>: themes + verbatim quote each + delta vs last run" --cron "*/30 * * * *"`.

## Attribution

Adapted from Boris Cherny, *Why Coding Is Solved* (Anthropic, 08:29), via the build-catalog extraction.
