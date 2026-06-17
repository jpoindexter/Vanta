---
id: modes-rooms-routing
title: Modes, rooms & routing
sidebar_position: 3
---

# Modes, rooms & routing

How Vanta adapts its stance, scopes itself per project, routes work across models, and improves itself over time.

## Operator modes

Modes are real skills that set Vanta's working stance. Install and run them:

```bash
vanta modes install
vanta skill <mode> "<instruction>"
```

| Mode | Stance |
|------|--------|
| `silent-executor` | Do the work, minimal narration |
| `collaborator` | Think alongside you, surface tradeoffs |
| `critic` | Adversarial review of a plan or output |
| `researcher` | Gather + synthesize before acting |
| `debugger` | Systematic root-cause investigation |
| `assistant` | General help |
| `solutioning-mode` | Goals + research → a ranked what-to-build recommendation, then stop before implementing |

**Auto stance** — `mode-detect` infers the right stance from your message and prepends a hint to the turn (disable with `VANTA_MODE_DETECT=0`).

## Project rooms

A room runs Vanta rooted in a specific project, with its own goal stream:

```bash
vanta rooms                      # list projects under VANTA_PROJECTS_DIR
vanta room <name> "<instruction>"  # run rooted in that project
```

`VANTA_PROJECTS_DIR` defaults to `~/Documents/GitHub/_active`. Each room keeps its own `.vanta/` (goals, events, approvals), so work in one project never bleeds into another.

## Model routing

Run cheap tasks on a small/local model and hard tasks on a strong one — automatically:

```bash
VANTA_MODEL_CHEAP=ollama:qwen2.5:14b
VANTA_MODEL_EXPENSIVE=openai:gpt-5.5
```

Vanta classifies each task (cheap vs expensive) and routes it. Unset = no routing (everything uses the active provider). Vision is routed separately — see [Providers](./providers.md#multimodal).

## Self-improvement

After turns, an opt-in background pass reviews the transcript and captures durable, reusable skills (tagged as learned) into `~/.vanta/skills`, and distils 0–3 durable memories into the brain. A usage tracker proposes capturing a workflow as a skill once it recurs.

```bash
VANTA_SELF_IMPROVE=1     # capture skills from successful turns
VANTA_BRAIN_LEARN=1      # distil memories post-turn
```

Best-effort and gated — see [Skills & memory](./skills-and-memory.md).
