---
id: faq
title: FAQ & troubleshooting
sidebar_position: 7
---

# FAQ & troubleshooting

## General

**Is Vanta a chatbot?**
No — it's a local trusted-operator agent. It knows the goal before it picks a tool, gates every action through an enforced kernel, and reports only what it verified. See [Introduction](./intro.md).

**Does my data leave my machine?**
Only if you use a cloud model or a network tool (web, comms, browser). Run fully local on Ollama — see [Self-host offline](./guides/self-host.md). State lives under `.vanta/` (per project) and `~/.vanta` (global).

**Which models can I use?**
OpenAI, Ollama, Anthropic, Gemini, OpenRouter. Switch with `vanta setup` or `/model`. See [Providers](./providers.md).

**How is this safe?**
A small Rust kernel classifies every action allow/ask/block and the agent can't bypass it (Rule Zero). See the [Safety model](./safety-model.md) and [Security features](./security.md).

## Setup

**The setup wizard didn't run.**
It only auto-runs on a TTY when no provider is configured. Run it explicitly: `vanta setup`. See the [Setup wizard](./setup.md).

**My API key isn't picked up.**
Keys live in `vanta-ts/.env` (or via `api_key_helper`). Run `vanta doctor` to check provider reachability + key presence. Keys are validated before the wizard writes them.

## Troubleshooting

**The kernel won't bind / port 7788 in use.**
A stale kernel may hold the port. Find and kill it:
```bash
lsof -nP -iTCP:7788 -sTCP:LISTEN     # note the PID, then: kill <pid>
```

**Web search returns nothing / 403.**
DuckDuckGo's HTML endpoint blocks datacenter IPs. On a flagged network, self-host Searxng or use Brave/SerpAPI (`VANTA_SEARCH_PROVIDER`). `web_fetch` is unaffected. See [Configuration](./configuration.md).

**Local model errors / "provider unreachable".**
Make sure `ollama serve` is running and the model is pulled (`ollama pull qwen2.5:14b`). Check `VANTA_OLLAMA_URL`.

**It resumed an old session I didn't want.**
Resume is age-gated (`VANTA_RESUME_MAX_AGE_MIN`, default 120; `0` = always fresh). A carried goal launches paused until `/goal resume`. See [Sessions & continuity](./sessions-and-continuity.md).

**A tool keeps asking for approval.**
That's the kernel escalating an `ask` action. Choose "Yes, don't ask again" to persist a tool-scoped rule, or configure auto-mode. A kernel **block** can never be allowed. See [Permissions & hooks](./permissions-and-hooks.md).

**Browser/vision tools fail.**
Live browser use needs `npx playwright install chromium`. Vision needs a vision-capable model (`VANTA_VISION_MODEL`).

**Commit blocked by the size gate.**
A file/function exceeded the limits. Split it, or set `VANTA_LINT_BLOCK=0` to warn-only. See [Modularity](./modularity.md).

**Changes I made didn't take effect.**
The agent loads code at launch (no hot reload). Use `/restart` (with `./run.sh`) to reload.

## Still stuck?

Run `vanta doctor` for a health report, `/bug` to capture a structured bug record, or `/handoff` for a continuity packet.
