---
id: configuration
title: Configuration
sidebar_position: 3
---

# Configuration

Vanta reads its agent-layer config from `vanta-ts/.env` (gitignored; `.env.example` documents every key). The kernel is configured by a few environment variables passed at launch.

## Pick a model backend

```bash
vanta setup     # interactive: openai | gemini | anthropic | openrouter | ollama
```

This writes `VANTA_PROVIDER` + `VANTA_MODEL` to `vanta-ts/.env`. The default is local **Ollama** (`qwen2.5:14b`) — no API key, runs offline. The full first-run flow (hidden key prompt, live validation, messaging, Google auth, `doctor`) is on the [Setup wizard](./setup.md) page.

## Core environment variables

| Variable | Purpose |
|----------|---------|
| `VANTA_PROVIDER` | `openai` · `ollama` · `anthropic` · `gemini` · `openrouter` |
| `VANTA_MODEL` | Model id for the chosen provider |
| `VANTA_EFFORT_LEVEL` | `low` · `medium` · `high` · `xhigh` · `max` (maps to reasoning effort / thinking budget) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Provider keys (only the one you use) |
| `VANTA_OLLAMA_URL` | Local Ollama endpoint |
| `VANTA_KERNEL_URL` | Kernel address (default `127.0.0.1:7788`) |
| `VANTA_ROOT` | Overrides the kernel's working-dir scope — set per project |
| `VANTA_MAX_ITER` | Max tool-call iterations per turn |
| `VANTA_HOME` | Global store dir (default `~/.vanta`) — holds skills, memory, brain |

## Provider keys, fail-fast

Config is validated at startup — a missing or malformed value fails fast with an actionable message rather than at first use. Secrets are never logged or echoed; if you paste a real key, rotate it.

## Search backend (optional)

```bash
VANTA_SEARCH_PROVIDER=auto    # default: configured providers, then Brave browser and Bing
VANTA_SEARCH_URL=...          # for self-hosted Searxng
SERPAPI_KEY=... / BRAVE_KEY=...
```

`ddg` and `jina_ddg` remain explicit legacy options, but automatic routing never
uses them because DuckDuckGo frequently bot-blocks agent traffic. For stronger
coverage, self-host Searxng or configure Brave, SerpAPI, Exa, Tavily, Parallel,
Firecrawl, or xAI search.

## Where state lives

| Path | What |
|------|------|
| `.vanta/` (per project) | `events.jsonl`, `approvals.tsv`, `goals.tsv`, loop + handoff state |
| `~/.vanta/` (global) | `skills/`, `memories/`, `brain/` — git-versioned for free history |

See [Providers](./providers.md) for the full backend matrix and [Skills & memory](./skills-and-memory.md) for the store layout.
