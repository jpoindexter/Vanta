---
id: tools
title: Tools
sidebar_position: 1
---

# Tools

Vanta ships **84 built-in tools** (86 registered, including the factory-built `mount_mcp` and `tool_search`). Every tool call is gated by the kernel before it runs. The model sees a per-turn scoped subset of the catalog; `tool_search` is always reachable to pull in the rest on demand.

## By category

### Files & dev
`read_file` · `write_file` · `edit_file` · `grep_files` · `glob_files` · `shell_cmd` · `run_code` (sandboxed python/node/rust) · LSP diagnostics + go-to-definition (TS/TSX) · 6 git tools (status/diff read-only; commit/push/branch/checkout approval-gated) · `regression_lock` (record a re-runnable proof of a fix).

`write_file` writes freely in-repo and only into a configured writable zone out-of-repo; it runs the size gate on every TS write and reports violations so the agent self-corrects.

### Web & search
`web_search` (DuckDuckGo / Searxng / SerpAPI / Brave) · `web_fetch` (readable-content extraction) · `rss_read` · `reddit_read` · `cookie_import` (kernel-gated credential store, never echoed).

### Browser & vision
`screenshot` · `browser_navigate` · `browser_extract` · `browser_act` (navigate/click/type/press/scroll with an approval-gated, masked dry-run preview for irreversible controls) · `describe_image` · `look_at_screen` · `look_at_camera`. Vision routes through a dedicated vision model when configured, so a text-only main model still has eyes.

### Comms (Google)
`gmail_search` / `gmail_read` (read) + `gmail_draft` / `gmail_send` (always approval-gated) · `calendar_read` + create/update · `drive_read` + create/update. One-time OAuth via `vanta auth google`.

### Autonomous & multi-agent
`delegate` (scoped subagent) · cron scheduler · background team workers · A2A message bus.

### Operator systems
`world` · `money` · `radar` · `team` · `life_search` · `self_repair` · reach tools — see [Operator systems](./operator-systems.md).

### Memory & learning
`brain` (remember/recall) · `recall` · `write_skill` · `roadmap_add` / `roadmap_move` · `clarify` · `inspect_state`.

## How a tool is gated

Each tool exposes a `describeForSafety(args)` that returns only the safety-relevant string (path or command). The kernel classifies it; the loop executes only on `allow`. See [the agent loop](./agent-loop.md).

## Adding your own

See [Extending Vanta](./extending.md) — a tool is a small file exporting a `schema`, `describeForSafety`, and `execute`, registered in `tools/all-tools.ts`.
