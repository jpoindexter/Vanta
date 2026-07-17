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
vanta setup messaging            # choose from the registry
vanta setup messaging telegram   # go directly to Telegram
```

Each platform shows an `[available | configured | planned]` status with numbered steps. **22 messaging adapters are registered**; every current catalog entry has a runtime adapter, while real delivery still depends on that platform's credentials, webhook, device, or service. Telegram setup recognizes an existing configuration before changing it, validates the @BotFather token against `getMe` before writing, and optionally stores a numeric owner allowlist in `VANTA_TELEGRAM_ALLOW`. A rejected token leaves the prior `.env` untouched.

Inside interactive Vanta, `/setup` is a setup-status hub rather than a model-picker alias. Use `/setup messaging` or ask “how do I set up Telegram?” for the current Telegram state and one exact repair action. See [Comms & gateway](./comms-and-gateway.md).

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
