---
id: providers
title: Providers
sidebar_position: 2
---

# Providers

Vanta is model-agnostic. The agent loop only sees the `LLMProvider` interface, so backends swap by changing `VANTA_PROVIDER` + `VANTA_MODEL` — no code changes.

## Supported backends

| `VANTA_PROVIDER` | Notes |
|------------------|-------|
| `openai` | OpenAI API; GPT-5 and o-series models get `reasoning_effort` from the effort level |
| `ollama` | Local models, no API key — the default (`qwen2.5:14b`) |
| `anthropic` | Anthropic Claude models; thinking-capable models use extended thinking on high/max effort |
| `gemini` | Google, via the OpenAI-compatible adapter (baseURL swap) |
| `openrouter` | Many models behind one key, via the OpenAI adapter |
| `azure` | Azure OpenAI / AI Foundry (deployment + `api-version`) |
| `custom` | **Any** OpenAI-compatible endpoint — point `VANTA_OPENAI_BASE_URL` at it |

Plus subscription-OAuth backends (`codex` for ChatGPT, `claude-code` for a Claude Pro/Max plan) and named OpenAI-compatible shortcuts (`deepseek`, `xai`, `groq`, `mistral`, `together`, `fireworks`, `cerebras`, `nvidia`, `moonshot`, `minimax`, `perplexity`, `tokenrouter`, `openrouter`, and more — each just a baseURL + key swap).

Set it interactively with `vanta setup`, or edit `vanta-ts/.env`.

### Current OpenAI models

Vanta's OpenAI API and ChatGPT-subscription Codex pickers include the current GPT-5.6 family: `gpt-5.6-sol` (the default for difficult coding and research), `gpt-5.6-terra` (balanced everyday work), and `gpt-5.6-luna` (fast, repeatable work). The OpenAI API picker also includes current API-key models such as `gpt-5.3-codex`, `gpt-5.2`, `gpt-5.2-pro`, `gpt-5.1`, `gpt-5`, `gpt-5-pro`, `gpt-5-mini`, `gpt-5-nano`, and `o3-pro`. The Codex subscription picker keeps Codex-agent models under the OAuth-backed `codex` provider, including `gpt-5.3-codex`, `gpt-5.3-codex-spark`, `gpt-5.2-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex`, `gpt-5.1-codex-mini`, `gpt-5-codex`, and `gpt-5-codex-mini`.

The picker is curated rather than an access-control boundary: type any model ID your account can use when it is not shown.

## Session vs default model

Model switches are session-scoped by default. They hot-swap the current conversation and are saved with that session, but do not mutate `process.env` or `vanta-ts/.env`.

```bash
/model ollama qwen2.5:14b             # this session (default)
/model openai gpt-4o --session        # explicit session scope
/model gemini gemini-2.5-pro --global # set current + future default
/model --global                       # set the current session model as default
```

The TUI and desktop pickers use session scope for their primary model action and expose **Set as default** separately. Two concurrent sessions can therefore use different providers; resuming either restores its saved route. Sessions created before this metadata existed adopt the configured default and write explicit model metadata on their next save.

### Routers reach every model

A **router** (`tokenrouter`, `openrouter`) is one key that proxies many models, so you're never pinned to one. `VANTA_MODEL` accepts **any** id the router serves — and `vanta setup` free-types the model for a router instead of showing a fixed list. (`VANTA_MODEL` has always accepted any string; routers just make that the default UX.)

## Add any provider — no code (`~/.vanta/providers.json`)

You don't need to touch the source to add a backend. Declare it in `~/.vanta/providers.json`, the same way `~/.vanta/agents.json` adds agent CLIs and `~/.vanta/mcp.json` adds MCP servers:

```json
{ "providers": {
  "nvidia-free": { "baseURL": "https://integrate.api.nvidia.com/v1", "keyEnv": "NVIDIA_API_KEY", "model": "deepseek-ai/deepseek-r1" },
  "tokenrouter": { "baseURL": "https://api.tokenrouter.com/v1", "keyEnv": "TOKENROUTER_API_KEY", "model": "MiniMax-M3", "router": true },
  "lan-llm":     { "baseURL": "http://192.168.1.5:8000/v1", "model": "qwen2.5:32b" }
}}
```

Then `VANTA_PROVIDER=nvidia-free` (+ optional `VANTA_MODEL`). Rules:

- **The secret never lives in this file** — only the env-var *name* (`keyEnv`); the actual key stays in `vanta-ts/.env`.
- Omit `keyEnv` for **keyless** local endpoints.
- A user entry **overrides a built-in** of the same id — so you can also fix a built-in's URL or default model yourself without waiting on a release.
- `router: true` makes the setup wizard free-type the model.

Template: `vanta-ts/providers.json.example`.

## Effort levels

`VANTA_EFFORT_LEVEL` (or `/effort <level>` live) is `low | medium | high | xhigh | max`:

- **OpenAI GPT-5 and o-series** — maps to `reasoning_effort` for low/high/xhigh/max when the selected model supports it.
- **Anthropic** — high/max enable extended thinking (8k / 32k budget tokens); low caps `max_tokens`.

## Multimodal

User messages can carry images (attach via `/image`, `/paste`, or drag-drop). Every provider maps them natively. Image-understanding tools resolve a dedicated vision model via `VANTA_VISION_MODEL` when set, so a text-only main model still has working vision.

## Task routing (optional)

Set `VANTA_MODEL_CHEAP` / `VANTA_MODEL_EXPENSIVE` and Vanta classifies each task and routes it to the cheaper or stronger model. Unset = no routing.

## Per-call route usage

Every completed agent-loop provider call is appended to `<project>/.vanta/route-usage-ledger.jsonl`. Each versioned row records the session and surface, actual serving provider/model, normalized base route, fallback depth, billing mode/status, input/output/cache/reasoning tokens, one API call, and cost when known.

## Model catalog updates

The desktop model picker refreshes from Vanta's published model catalog and caches it for six hours. If the network is unavailable, it uses the last valid local catalog and then the bundled catalog. A listed model still requires that your selected provider account is entitled to run it; Vanta reports provider errors rather than treating a picker entry as an entitlement guarantee.

This is call-level attribution, so a fallback is charged to the route that served it and a mid-session model switch starts a new route row. Local and subscription-included calls remain visible at `$0`; unknown-cost calls remain visible as `~?`.

```bash
/usage breakdown   # route totals when route rows exist; legacy spend view otherwise
/dashboard         # current model plus accumulated serving routes
```

The older `spend-ledger.jsonl` remains the turn-level budget compatibility source. Views never add both ledgers together, so existing sessions remain readable without double counting.

## Adding a provider

Implement `LLMProvider` (`complete` / `modelId` / `contextWindow`) and add a branch in `providers/index.ts`. The loop stays unchanged — see [Extending Vanta](./extending.md).
