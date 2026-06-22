---
id: setup
title: Setup wizard
sidebar_position: 2
---

# Setup wizard

The first time you launch `vanta` on a terminal without a configured provider, it runs the **setup wizard** automatically — no separate command needed. Run it any time with:

```bash
vanta setup     # interactive: openai | gemini | anthropic | openrouter | ollama
```

## What the wizard does

1. Lists the available backends from the provider catalog, with signup URLs.
2. Prompts for a model id (a sensible default per provider).
3. For key-based providers, prompts for the API key **hidden** — never echoed.
4. **Validates** the choice with a live probe *before* writing anything — a bad key fails the wizard instead of silently breaking your first turn.
5. Writes `VANTA_PROVIDER` + `VANTA_MODEL` (+ the key) to `vanta-ts/.env` at `0600`, merging into any existing `.env` (other keys preserved).

The default is local **Ollama** (`qwen2.5:14b`) — no API key, runs offline.

## Messaging setup

```bash
vanta setup messaging   # registry-driven wizard
```

Each platform shows an `[available | configured | planned]` status with numbered steps. **20 messaging adapters are wired** — five are live today (**Telegram · WhatsApp · Signal · Discord · Slack**), the rest are wired and configurable. For Telegram, paste a @BotFather token and it configures `VANTA_TELEGRAM_TOKEN` for you. See [Comms & gateway](./comms-and-gateway.md).

## Other one-time setup

```bash
vanta auth google     # one-time OAuth for gmail / calendar / drive
```

## Verify it worked

```bash
vanta doctor          # kernel ping · provider reachable · key presence · store · goals
```

The setup assistant probes the provider completion, the Google OAuth path, MCP mount/list-tools, and any configured messaging token — reporting errors as values with secrets redacted.

## Keys without .env

Prefer not to keep keys in a file? Use an `api_key_helper` to fetch them from a secret manager at startup — see [Settings & secrets](./settings.md#secret-injection-api_key_helper).

Next: [Configuration](./configuration.md) for the full environment + state layout.
