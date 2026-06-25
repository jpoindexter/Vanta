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
| `openai` | OpenAI API; o-series gets `reasoning_effort` from the effort level |
| `ollama` | Local models, no API key — the default (`qwen2.5:14b`) |
| `anthropic` | Anthropic Claude models; thinking-capable models use extended thinking on high/max effort |
| `gemini` | Google, via the OpenAI-compatible adapter (baseURL swap) |
| `openrouter` | Many models behind one key, via the OpenAI adapter |
| `azure` | Azure OpenAI / AI Foundry (deployment + `api-version`) |
| `custom` | **Any** OpenAI-compatible endpoint — point `VANTA_OPENAI_BASE_URL` at it |

Plus subscription-OAuth backends (`codex` for ChatGPT, `claude-code` for a Claude Pro/Max plan) and named OpenAI-compatible shortcuts (`deepseek`, `xai`, `groq`, `mistral`, `together`, `fireworks`, `cerebras`, `nvidia`, `moonshot`, `minimax`, `perplexity`, `tokenrouter`, `openrouter`, and more — each just a baseURL + key swap).

Set it interactively with `vanta setup`, or edit `vanta-ts/.env`.

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

`VANTA_EFFORT_LEVEL` (or `/effort <level>` live) is `low | medium | high | max`:

- **OpenAI o-series** — maps to `reasoning_effort` for low/high/max.
- **Anthropic** — high/max enable extended thinking (8k / 32k budget tokens); low caps `max_tokens`.

## Multimodal

User messages can carry images (attach via `/image`, `/paste`, or drag-drop). Every provider maps them natively. Image-understanding tools resolve a dedicated vision model via `VANTA_VISION_MODEL` when set, so a text-only main model still has working vision.

## Task routing (optional)

Set `VANTA_MODEL_CHEAP` / `VANTA_MODEL_EXPENSIVE` and Vanta classifies each task and routes it to the cheaper or stronger model. Unset = no routing.

## Adding a provider

Implement `LLMProvider` (`complete` / `modelId` / `contextWindow`) and add a branch in `providers/index.ts`. The loop stays unchanged — see [Extending Vanta](./extending.md).
