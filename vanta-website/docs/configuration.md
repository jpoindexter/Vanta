---
id: configuration
title: Configuration
sidebar_position: 3
---

# Configuration

Vanta reads its agent-layer config from `vanta-ts/.env` (gitignored; `.env.example` documents every key). The kernel is configured by a few environment variables passed at launch.

## First-run setup wizard

The first time you launch `vanta` on a TTY without a configured provider, it runs the **setup wizard** automatically — no separate command needed. You can also run it any time:

```bash
vanta setup     # interactive: openai | gemini | anthropic | openrouter | ollama
```

The wizard:

1. Lists the available backends from the provider catalog with their signup URLs.
2. Prompts for a model id (with a sensible default per provider).
3. For key-based providers, prompts for the API key **hidden** (never echoed).
4. **Validates** the choice with a live probe *before* writing anything — a bad key fails the wizard instead of silently breaking your first turn.
5. Writes `VANTA_PROVIDER` + `VANTA_MODEL` (+ the key) to `vanta-ts/.env` with `0600` perms, merging into any existing `.env` (other keys preserved).

The default is local **Ollama** (`qwen2.5:14b`) — no API key, runs offline.

### Messaging setup

```bash
vanta setup messaging   # registry-driven wizard
```

Shows each platform with an `[available | configured | planned]` status and numbered steps. **Telegram** is the live adapter — paste a @BotFather token and it configures `VANTA_TELEGRAM_TOKEN` for you. See [Comms & gateway](./comms-and-gateway.md).

### Other one-time setup

```bash
vanta auth google     # one-time OAuth for gmail / calendar / drive
```

### Check it worked

```bash
vanta doctor          # kernel ping · provider reachable · key presence · store · goals
```

The setup assistant probes the provider completion, Google OAuth path, MCP mount/list-tools, and any configured Telegram token — reporting errors as values with secrets redacted.

## Core environment variables

| Variable | Purpose |
|----------|---------|
| `VANTA_PROVIDER` | `openai` · `ollama` · `anthropic` · `gemini` · `openrouter` |
| `VANTA_MODEL` | Model id for the chosen provider |
| `VANTA_EFFORT_LEVEL` | `low` · `medium` · `high` · `max` (maps to reasoning effort / thinking budget) |
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
VANTA_SEARCH_PROVIDER=ddg     # ddg | searxng | serpapi | brave  (default ddg)
VANTA_SEARCH_URL=...          # for self-hosted Searxng
SERPAPI_KEY=... / BRAVE_KEY=...
```

> DuckDuckGo's HTML endpoint blocks datacenter IPs — for reliable search off a residential IP, self-host Searxng or use Brave/SerpAPI.

## Where state lives

| Path | What |
|------|------|
| `.vanta/` (per project) | `events.jsonl`, `approvals.tsv`, `goals.tsv`, loop + handoff state |
| `~/.vanta/` (global) | `skills/`, `memories/`, `brain/` — git-versioned for free history |

See [Providers](./providers.md) for the full backend matrix and [Skills & memory](./skills-and-memory.md) for the store layout.
