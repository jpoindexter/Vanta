---
id: self-host
title: Self-host Vanta offline
sidebar_position: 1
---

# Self-host Vanta offline

Run Vanta fully local — no API keys, no data leaving your machine — on a local model via Ollama.

## 1. Install the prerequisites

- **git** — the only required tool; the Rust kernel and Node 22 are downloaded automatically by the installer (no toolchain needed).
- **[Ollama](https://ollama.com)** for local models

```bash
ollama pull qwen2.5:14b      # the default local model
ollama serve                  # keep it running
```

## 2. Install Vanta

```bash
git clone https://github.com/jpoindexter/Vanta ~/vanta && cd ~/vanta
./install.sh                  # downloads the prebuilt kernel + Node, installs deps, adds `vanta` to PATH
```

## 3. Point it at Ollama

```bash
vanta setup        # choose: ollama
```

This writes `VANTA_PROVIDER=ollama` + `VANTA_MODEL=qwen2.5:14b` to `vanta-ts/.env`. No key needed. To tune the endpoint, set `VANTA_OLLAMA_URL`.

## 4. Run it

```bash
vanta              # interactive, fully offline
vanta doctor       # confirm: kernel up, provider reachable
```

## What still works offline

Files, code, shell, git, the brain/memory, skills, operator systems, scheduling — all local. What needs the network: web search/fetch, browser tools, comms (Gmail/Telegram), and any cloud model.

## Keep keys out of files (optional)

If you later add a cloud provider, fetch its key from a secret manager instead of `.env`:

```json
// .vanta/settings.json
{ "api_key_helper": "op read op://vault/anthropic/key" }
```

See [Settings & secrets](../settings.md).

## Harden execution (optional)

```bash
VANTA_SANDBOX=1    # OS-level isolation for shell_cmd / run_code
```

See [Security features](../security.md).
