---
id: environment
title: Environment variables
sidebar_position: 2
---

# Environment variables

Agent-layer config lives in `vanta-ts/.env` (gitignored; `.env.example` documents the keys). Kernel variables are passed at launch. This is a reference of the most-used keys — see `.env.example` for the complete, current list.

## Provider & model
| Variable | Purpose |
|----------|---------|
| `VANTA_PROVIDER` | `openai` · `ollama` · `anthropic` · `gemini` · `openrouter` |
| `VANTA_MODEL` | Model id for the provider |
| `VANTA_EFFORT_LEVEL` | `low` · `medium` · `high` · `max` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Provider keys |
| `VANTA_OLLAMA_URL` | Local Ollama endpoint |
| `VANTA_MODEL_CHEAP` / `VANTA_MODEL_EXPENSIVE` | Task-routed models (unset = no routing) |
| `VANTA_VISION_MODEL` / `VANTA_VISION_PROVIDER` | Auxiliary vision routing |

## Kernel & scope
| Variable | Purpose |
|----------|---------|
| `VANTA_KERNEL_URL` | Kernel address (default `127.0.0.1:7788`) |
| `VANTA_ROOT` | Overrides the kernel's working-dir scope |
| `VANTA_MAX_ITER` | Max tool iterations per turn |
| `VANTA_HOME` | Global store dir (default `~/.vanta`) |
| `VANTA_WRITABLE_DIRS` / `VANTA_READABLE_DIRS` | Out-of-repo write/read zones |

## Search & web
| Variable | Purpose |
|----------|---------|
| `VANTA_SEARCH_PROVIDER` | `auto` (default) · managed providers · `brave_browser` · `bing`; DDG variants are explicit legacy options |
| `VANTA_SEARCH_URL` | Self-hosted Searxng |
| `SERPAPI_KEY` / `BRAVE_KEY` | Search API keys |
| `VANTA_ALLOWED_DOMAINS` | Browser-tool domain allowlist |
| `VANTA_BROWSER_EXECUTABLE` | Optional Chrome/Brave/Edge/Chromium executable override; system installs are auto-detected when Playwright's bundle is absent |
| `VANTA_EMBED_MODEL` | Local embedding model (life-search semantic) |

## Continuity & behavior
| Variable | Purpose |
|----------|---------|
| `VANTA_RESUME_MAX_AGE_MIN` | Resume age gate (default 120; 0 = always clean) |
| `VANTA_GOAL_RESUME` | `auto` resumes carried goals on launch |
| `VANTA_AUTOHANDOFF_THRESHOLD` | Context-fill trigger for auto-handoff (0.75) |
| `VANTA_SESSION_MEMORY` | Session-memory distiller |
| `VANTA_TOOL_RETRIES` | Safe-read retry count |
| `VANTA_INHIBIT_THRESHOLD` · `VANTA_SETSHIFT_THRESHOLD` · `VANTA_STALL_THRESHOLD` | Executive-function gate thresholds |
| `VANTA_TOOL_SCOPE` | `0` exposes the full tool catalog |
| `VANTA_TUI` | `v2` selects the mission-control shell |
| `VANTA_SPINNER` | Busy animation |

## Security & self-improvement
| Variable | Purpose |
|----------|---------|
| `VANTA_SANDBOX` | `1` wraps shell_cmd / run_code in OS-level isolation |
| `VANTA_SANDBOX_NET` | `1` allows outbound network inside the sandbox |
| `VANTA_AUTONOMY_LEVEL` | Factory autonomy 1–5 (default 4 = commit + push) |
| `VANTA_FACTORY_DISABLED` | Kill switch for the self-improvement factory |
| `VANTA_AUTONOMY_ALLOW_MERGE` / `VANTA_FACTORY_MERGE_TARGET` | Gate + target for L5 merges |
| `VANTA_CRITIC` | `1` enables the independent post-turn critic |
| `VANTA_LINT_BLOCK` | `0` downgrades the pre-commit size gate to warn-only |
| `VANTA_SELF_IMPROVE` / `VANTA_BRAIN_LEARN` | Capture skills / distil memories post-turn |

## Comms & gateway
| Variable | Purpose |
|----------|---------|
| `VANTA_GOOGLE_CLIENT_ID` / `_SECRET` | Google OAuth client |
| `VANTA_TELEGRAM_TOKEN` | Telegram bot |
| `VANTA_WEBHOOK_PORT` / `_SECRET` / `_PROMPT` / `_DELIVER` | Webhook listener |

> Local `.env` defaults to Ollama `qwen2.5:14b` (no key, offline). Secrets are never logged; `.env` is gitignored.
