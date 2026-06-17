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

Set it interactively with `vanta setup`, or edit `vanta-ts/.env`.

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
