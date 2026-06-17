# Vanta Use-Case Coverage Audit (2026-06-08)

Source of truth: `docs/feature-map.html` data island (67 capability rows, grounded in prior agent v0.15.1 read live), `docs/feature-audit.md`, `docs/_recon/`, and confirmed roadmap.json statuses.

Status icons: ✅ fully covered · 🟡 partially covered · ❌ not covered · ⬜ deliberately skipped (forget)

## Coverage summary

- Total prior agent capability areas surveyed: 67
- Fully covered (have): 29 (43%)
- Partially covered (partial): 22 (33%)
- Not covered / copy-targeted (missing): 15 (22%), of which 6 are "forget" (deliberate)
- N/A (not applicable to Vanta): 1 (1%)

Of the 9 actionable missing items, all have roadmap cards (SELF-UPDATE, MODEL-CMD, MODEL-FALLBACK, PROXY-ENDPOINT, SESSION-SEARCH, KANBAN-DECOMPOSE, DEP-AUDIT, ACP-SERVE, CLI-DX-PACK).

> Note on table vs summary reconciliation: counts above are over the 67 prior agent capabilities in the parity map data island. The map below omits ~9 off-thesis "forget" rows (Nous Portal, Web dashboard, isolated profiles, i18n, RL datagen, pairing codes, Bitwarden, computer-use desktop, plugin framework) and adds ~10 Vanta-distinctive capabilities with no prior agent equivalent (AUTO-ROUTER, auto-handoff, MEM-RELEVANCE, EF gates, operator task stack, OPERATOR-DASHBOARD, VISION-COMPARE, streaming, MCP-gated-serve, brain/selfhood); table icon counts therefore exceed the summary totals.

## Capability map

### Setup / Models

| Capability area | Prior agent | Vanta | Status | Notes |
|---|---|---|---|---|
| Setup wizard | `setup` wizard | `vanta setup` first-run wizard | ✅ | |
| Doctor / status | `doctor` / `status` | `vanta doctor` + kernel doctor, `vanta status` | ✅ | |
| Provider auth | Pooled creds, login/logout | env keys + OAuth: codex, claude-code (live-verified) | ✅ | Vanta also has subscription OAuth |
| Config show/edit/migrate | `config` command | `.env` + `upsertEnv` (merge, preserve) | 🟡 | Config-migrate folded into SELF-UPDATE |
| Shell completion | bash/zsh/fish | none | ❌ | → CLI-DX-PACK |
| Secrets management | Bitwarden Secrets Manager | `.env` + gitleaks pre-commit | ⬜ | External secret source = platform-thinking |
| Model select | `model` — CLI pulldown | TUI ModelPicker only | 🟡 | → MODEL-CMD (S, next) |
| Provider catalog | models.dev catalog (109+) | 7 providers (openai/ollama/anthropic/gemini/openrouter/codex/claude-code) | 🟡 | Curated > catalog; HP-PROVIDERS (S, next) |

### Model Routing & Fallback

| Capability area | Prior agent | Vanta | Status | Notes |
|---|---|---|---|---|
| Task routing (cheap/expensive) | Cheap/expensive routing | `VANTA_MODEL_CHEAP/_EXPENSIVE` + `classifyTask` | ✅ | |
| Aux-task model | Vision/summarize routing | AUX-VISION + AUX-MAP (shipped) | ✅ | AUX-MAP generalized per-function map |
| Fallback chain on failure | `fallback` — primary dies → next | none — dead provider fails the turn | ❌ | → MODEL-FALLBACK (next) |
| Local OpenAI-compat proxy | `proxy` over OAuth | none | ❌ | → PROXY-ENDPOINT (next) |
| Auto per-task routing | Ephemeral subagents | AUTO-ROUTER (shipped) | ✅ | |

### Gateway / Comms

| Capability area | Prior agent | Vanta | Status | Notes |
|---|---|---|---|---|
| Gateway daemon | run/start/stop/install | `vanta gateway` + launchd service | ✅ | |
| Messaging platforms | 21 platforms (discord/slack/whatsapp/signal/imessage/email/matrix/…) | Telegram live + MSG-REGISTRY (iMessage/Signal/WhatsApp planned) | 🟡 | Add on demand; HP-21-PLATFORMS (S, next) |
| Webhook subscriptions | `webhook` subscriptions | Webhook listener + HMAC verify | ✅ | |
| Send to platform | `send` command | Gateway reply only | 🟡 | → CLI-DX-PACK |
| Pairing / allowlist | Pairing codes | Telegram allowlist | ⬜ | Allowlist suffices until demand |
| Google comms (Gmail/Calendar/Drive) | Via skills | `gmail`/`calendar`/`drive` tools (approval-gated) | ✅ | Vanta has these as first-class gated tools |

### Agent Loop & Runtime

| Capability area | Prior agent | Vanta | Status | Notes |
|---|---|---|---|---|
| Interactive chat / oneshot | REPL + one-shot | `vanta` REPL+TUI / `vanta run` | ✅ | |
| Toolsets | 30 keys, per-platform config | 46 tools + registry exclude | ✅ | Per-platform toolset config is gateway-only → forget |
| Computer-use (desktop control) | `cua-driver` | Browser tools + screenshot/vision | ⬜ | Horizon; browser covers web |
| LSP | status/list/install | LSP tools (.ts/.tsx via TS compiler API) | ✅ | |
| Cron / scheduled jobs | `cron` / scheduled jobs | `vanta cron` + schedule runner | ✅ | |
| Hooks | Shell-script, list/test/revoke | Claude Code hooks integration (shipped) | 🟡 | Revokeable user hooks = later (VANTA-HOOKS, M, next) |
| Prompt-size breakdown | CLI breakdown command | Prompt tiers, no breakdown cmd | ❌ | → CLI-DX-PACK |
| RL datagen pipeline | batch_runner, mini-swe, trajectory | none | ⬜ | Operator, not a training harvester — off-thesis |

### Skills

| Capability area | Prior agent | Vanta | Status | Notes |
|---|---|---|---|---|
| Skill search/install/manage | `skills` command | `write_skill`/`recall` + library auto-install | ✅ | |
| Skill index in prompt + body on demand | Index injected, body on demand | Skill INDEX injected + `recall` loads body | ✅ | |
| Curator (background maintenance + pin) | Umbrella consolidation + pin | `curate()` — archive-stale only | 🟡 | → SKILL-UMBRELLA (next) |
| Skill bundles | Skill aliases | Operator modes (skill groups) | ✅ | Modes ≈ bundles |
| Skill count | 169 bundled (74 + 95 optional) | ~35 bundled + design/AI libraries | 🟡 | "Management beats count" — curate on demand |

### Memory / Continuity

| Capability area | Prior agent | Vanta | Status | Notes |
|---|---|---|---|---|
| Sessions save/resume/rename | Save/resume/search | Save/resume/fork/title (JSON store) | ✅ | |
| Session search / browse (FTS) | FTS over past sessions | List + resume by id only | ❌ | → SESSION-SEARCH (next) |
| Session recap | `/recap` | `/where` + EF gates | 🟡 | → CLI-DX-PACK (vanta recap) |
| Memory provider | External memory provider | Per-goal memory + Brain (5D/12-axis, git-versioned) | ✅ | Vanta's brain is richer than a flat provider |
| Checkpoints | Filesystem store | Checkpoints (shipped) | ✅ | |
| Auto-handoff / continuity | — | AUTO-HANDOFF (shipped) | ✅ | Vanta-distinctive — no prior agent equivalent |
| Memory relevance gating | — | MEM-RELEVANCE (shipped) | ✅ | Vanta-distinctive |
| Backup / import | zip home dir | `~/.vanta` git-init'd (free versioning) | 🟡 | → CLI-DX-PACK (vanta backup) |

### Kanban / Planning

| Capability area | Prior agent | Vanta | Status | Notes |
|---|---|---|---|---|
| Kanban board | SQLite, cross-profile | roadmap.json board + move + drag-serve | ✅ | File-based + drag board |
| Decompose / specify | Card → spec → subtasks | none | ❌ | → KANBAN-DECOMPOSE (next) |
| Swarm (delegation graph) | root→workers→verifier | `delegate` + `compose_workflow` + `graph_query` | 🟡 | Graph layer = KANBAN-DECOMPOSE |
| Diagnostics / distress signals | Distress signals | EF gates (error-detect / stall recovery) | 🟡 | EF covers the behavioral side |
| Goals | Standing goals | Kernel `GoalLedger` (ENFORCED) | ✅ | Vanta stronger: kernel-enforced, not a prompt rule |
| Operator task stack | — | EF-TASKSTACK — `/tasks` (shipped) | ✅ | Vanta-distinctive |
| Operator dashboard | — | OPERATOR-DASHBOARD — `/dashboard` (shipped) | ✅ | Vanta-distinctive |

### Security

| Capability area | Prior agent | Vanta | Status | Notes |
|---|---|---|---|---|
| Action safety gating | None at the boundary | Rust kernel `assess()` — ENFORCED boundary | ✅ | Vanta-distinctive — prior agent has NO equivalent |
| Approval before risk | Advisory only | Kernel `ApprovalQueue` (persisted) | ✅ | Vanta-distinctive |
| Supply-chain audit | OSV, security audit | none | ❌ | → DEP-AUDIT (next) |
| Compromised-package advisories | Advisory feed | gitleaks pre-commit only | 🟡 | → DEP-AUDIT |

### Plugins / Extensibility

| Capability area | Prior agent | Vanta | Status | Notes |
|---|---|---|---|---|
| ACP server (Zed editor) | `acp` — in-editor agent | none (MCP server only) | ❌ | → ACP-SERVE (next) |
| MCP client | Use servers | `mcp/client` + `mount.ts` | ✅ | |
| MCP server | Serve agent as an MCP server | `mcp/server.ts` — every call `assess()`-gated | ✅ | Vanta gates; prior agent doesn't |
| MCP catalog / picker | Full catalog with picker | Mount config (project + user merge) | 🟡 | → HP-MCP-CATALOG-PICKER (S, next) |
| Plugin framework | git install | Skills + MCP mount | ⬜ | MCP+skills cover it; parked post-users |

### Voice / Multimodal

| Capability area | Prior agent | Vanta | Status | Notes |
|---|---|---|---|---|
| Voice loop | Whisper + TTS | Voice loop (shipped) | ✅ | |
| Vision / image tools | Describe/screenshot tools | `describe_image`/`look_at_screen`/camera/`watch_video` + AUX-VISION | ✅ | |
| Vision comparison | — | VISION-COMPARE (shipped) | ✅ | Vanta-distinctive |
| Infographic / C2PA assets | C2PA-signed assets | none | ⬜ | Niche |

### Ops / Update

| Capability area | Prior agent | Vanta | Status | Notes |
|---|---|---|---|---|
| Update + rollback | `update` — snapshot, autostash, dep/skill refresh | `install.sh`/`run.sh` self-bootstrap only | ❌ | → SELF-UPDATE (M, next) |
| Logs / debug | Events log | `events.jsonl` + kernel logs | ✅ | |
| Relaunch / service manager | External service | launchd user agent | ✅ | |
| Executive-function gates | None | Inhibit/set-shift/closure/research/self-monitor (shipped) | ✅ | Vanta-distinctive — no prior agent equivalent |

### TUI / Command Surface

| Capability area | Prior agent | Vanta | Status | Notes |
|---|---|---|---|---|
| Rich slash command set | ~75 commands + skills | ~37 commands (help/clear/model/tools/skills/status/goals/sessions/resume/cron + all EF set) | 🟡 | TUI parity track: 7 items in next (THINK-FOLD, TUI-V2-PALETTE, TUI-V2-RAILS, TUI-KEYS, TUI-SELECT, VANTA-TRANSCRIPT, VANTA-TODO) |
| Streaming deltas | `stream_dispatch.py` | `LLMProvider.stream()` + TUI deltas | ✅ | |
| Multi-session switcher | Live session switcher overlay | Single session in process | 🟡 | By design (single trusted operator) |

## Coverage gaps summary

Nine actionable missing items — all have roadmap cards, all status `next`:

1. **SELF-UPDATE** — Safe self-updater with rollback. Prior agent snapshots before mutating; Vanta has no equivalent. Medium, pebble.
2. **SESSION-SEARCH** — FTS over saved sessions. Vanta lists/resumes by id only. Small, sand.
3. **MODEL-FALLBACK** — Provider fallback chain on failure. A dead provider currently fails the whole turn. Small, sand.
4. **KANBAN-DECOMPOSE** — Card → spec → subtasks. The factory decompose/swarm loop. Large, rock.
5. **DEP-AUDIT** — Supply-chain audit (npm advisory + OSV). Prior agent caught a PyPI worm; Vanta gates actions but never audits its own deps. Small, sand.
6. **ACP-SERVE** — Vanta as an ACP server (Zed editor integration). Reach, kernel still gates. Small, sand.
7. **PROXY-ENDPOINT** — Local OpenAI proxy over OAuth. Reuses codex/claude-code subscription tokens. Small, sand.
8. **CLI-DX-PACK** — Bundles: shell completion, prompt-size, send, recap, backup. Small, sand.
9. **MODEL-CMD** — CLI provider/model pulldown (complements TUI picker). Small, sand.

Thirteen partial items have narrower follow-on cards (SKILL-UMBRELLA, HP-21-PLATFORMS, HP-MCP-CATALOG-PICKER, VANTA-HOOKS, etc.) and are covered by existing roadmap entries.

Six "missing" items are deliberate skips (Bitwarden, pairing codes, computer-use desktop, RL datagen, plugin framework, infographic) — off-thesis for a local trusted operator.

**Vanta's differentiation vs prior agent** (no prior agent equivalent): Rust `assess()` kernel, persistent `ApprovalQueue`, EF gate suite (inhibit/set-shift/closure/research-gate/self-monitor), auto-handoff, memory relevance gating, 5D/12-axis git-versioned brain, operator task stack + dashboard.
