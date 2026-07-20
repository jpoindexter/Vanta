---
id: quickstart
title: Quickstart
sidebar_position: 2
---

# Quickstart

**macOS/Linux prereq:** `git`. The Rust kernel and Node 22 are downloaded automatically on first install when supported prebuilt assets are available.

## Install

### Desktop app for macOS

[Download the signed and notarized Vanta v0.9.5 DMG](https://github.com/jpoindexter/Vanta/releases/download/v0.9.5/Vanta-0.9.5-arm64.dmg), open it, and drag Vanta into Applications. This build targets Apple Silicon Macs and shares `~/.vanta` configuration and sessions with the CLI.

### macOS and Linux

One command on a fresh machine clones Vanta, downloads the prebuilt kernel, and puts a global `vanta` on your PATH:

```bash
curl -fsSL https://vanta.theft.studio/install.sh | bash
```

> No Rust or system Node required — `install.sh` downloads a checksum-verified prebuilt kernel (from the GitHub release) and a portable Node 22 (from nodejs.org) when they're missing. Override the location with `VANTA_DIR=/path bash bootstrap.sh`.

### Windows 11

Run the tracked PowerShell installer from a clone:

```powershell
git clone https://github.com/jpoindexter/Vanta.git
cd Vanta
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

The Windows installer uses `winget` when Git, Node 22, or Rust is missing. It first tries the checksum-verified x64 release kernel, then falls back to a native Cargo build. Background service installation is currently macOS-only, so run `vanta gateway` in the foreground on Windows.

Then pick a model backend and start a session:

```bash
vanta setup     # choose: openai | gemini | anthropic | openrouter | ollama
vanta           # interactive session
vanta doctor    # health check
```

The provider defaults to local **Ollama** (`qwen2.5:14b`, no API key) — make sure Ollama is running, or edit `vanta-ts/.env` to switch to OpenAI/Anthropic.

## Run from the repo

```bash
./run.sh                                   # interactive session
./run.sh run "read README.md and summarize it"   # one-shot
./run.sh doctor                            # agent-side health
./run.sh help                              # list all subcommands
```

First run downloads the prebuilt kernel (and a portable Node if needed) and installs agent deps once; after that it's instant. The kernel auto-starts whenever the agent needs it. (`./vanta` is an alias for `./run.sh`.)

## Common subcommands

```bash
./run.sh skills | skill <name> ["<instr>"]   # learned skills
./run.sh rooms | room <name> "<instr>"        # per-project goal streams
./run.sh schedule "<instr>" --cron "0 8 * * *"  # cron-scheduled runs
./run.sh auth google                          # one-time Google OAuth (gmail/calendar/drive)
./run.sh resume <id> --fork-session           # resume history into a new session
```

## Seed a goal

Vanta is goal-aware — give it something to work toward:

```bash
vanta goals add "ship the v1 docs site"
```

Inside a session, `/goal <text>` sets the working goal, `/goal resume` picks up a carried goal from a previous session, and `/goal clear` drops it.

## Let Vanta see the screen

On macOS, capture only the context you want Vanta to inspect:

```text
/look          # drag-select an area
/look window   # choose one window
/look screen   # capture every display
```

The image is attached to the next message and can be removed before sending. The first capture may ask for **System Settings → Privacy & Security → Screen Recording** permission; relaunch the terminal or Desktop app after granting it. See [Sight & screen context](./sight.md).
