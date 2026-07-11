# Hermes Current vs Vanta Vision - refreshed 2026-07-12

Source checked:
- `NousResearch/hermes-agent` at `4281151ae859241351ba14d8c7682dc67ff4c126` (`origin/main` when refreshed)
- Delta from the prior pinned snapshot `3b2ef789dfcf92f5b7b18c08c59d25948e50857f`: 33 commits, audited in `docs/research/hermes-current-delta-2026-07-12.md`
- Hermes docs under `reference/hermes-agent/website/docs`
- Vanta `README.md`, `MANIFESTO.md`, `docs/living-operator.md`, `roadmap.json`
- Prior Hermes transcript extraction: `docs/research/hermes-transcript-roadmap-extract-2026-07-11.md`

## Vanta Vision Filter

Vanta should not clone Hermes. The north star is a local personal operator that knows Jason's goals, acts across the whole digital life, proves what it did, learns locally, and stays inside a hard kernel boundary. Hermes is useful as a reference for operator surfaces and workflow maturity, not as a product thesis.

Keep from Hermes when it strengthens:
- persistent specialist agents
- visible work routing
- multi-surface reach
- closed learning loops
- vault-backed credentials
- dashboard/operator visibility
- context and verification discipline

Reject or adapt when it pushes Vanta toward:
- vendor/subscription bundle dependency
- cloud-first execution as default
- broad platform/SaaS surface before single-operator trust
- dashboard/plugin complexity without kernel-gated actions

## Current Hermes Strengths

| Surface | Hermes current state | Vanta current state | Gap decision |
|---|---|---|---|
| Profiles | Full profile system with separate config, env, SOUL, memory, sessions, skills, cron, gateway state, aliases, import/export, descriptions for Kanban routing. | Vanta shipped `HERMES-PROFILE-ROSTER` with persistent specialists and isolated state. | Core parity slice shipped. |
| Profile gateways | One gateway per profile plus optional multiplexing gateway with `/p/<profile>/` routing and per-profile secret/session isolation. | Vanta has messaging adapters and run-anywhere/gateway work, but not an operator-visible profile gateway model. | Fold into `HERMES-PROFILE-ROSTER` and `HERMES-KANBAN-ROUTER`; do not create separate card yet. |
| Kanban | SQLite durable task board, boards, attachments, dispatcher, profile workers, worker lanes, lifecycle tools, comments, logs, retry/reclaim/block/done. | Vanta shipped `HERMES-KANBAN-ROUTER`, routing durable work to profiles with evidence. | Core parity slice shipped. |
| Delegation | `delegate_task` has isolated fresh child contexts, parallel batch mode, toolset restriction, summaries back to parent. Kanban handles durable multi-agent workflows. | Vanta shipped delegation-tree receipts on top of delegate/swarm/sidechain/build loops. | Matched enough; evaluate behavior rather than add another card. |
| MoA | Mixture-of-Agents is a selectable virtual provider with presets, reference models, aggregator, caching design, CLI/dashboard/desktop support. | Vanta has `SOL-MIXTURE-OF-AGENTS` shipped. | Matched enough. No new card. |
| Secrets | Bitwarden Secrets Manager, 1Password, and a secret-source plugin framework with minimal env subprocess safety and source precedence. | Vanta shipped scoped Bitwarden/1Password aliases, startup injection, status, confirmed cutover, and redacted audit proof in `HERMES-VAULT-SECRETS-ROTATION`. | Parity slice shipped; keep external-provider acceptance separate from local implementation evidence. |
| Dashboard | Local web dashboard manages profiles, config, keys, MCP, models, sessions, cron, gateway, logs, analytics, chat, plus dashboard themes/plugins/slots/backend API routes. | Vanta has desktop, command center, operator home, ephemeral dashboards, and shipped bounded plugin panel slots. | Mostly matched. Keep plugin slots bounded; do not make dashboard the center. |
| Messaging/reach | Broad gateway docs and adapters across Telegram, Discord, Slack, WhatsApp, Signal, Email, Teams, Matrix, etc. | Vanta claims 20 adapters with live proof only on some; Teams and live run-anywhere proofs are parked. | Do not chase all channels now. Keep external-proof cards parked until credentials/hardware exist. |
| Learning/memory | Curator, session search, Honcho user modeling, memory providers, skill creation/improvement, trajectory tooling. | Vanta shipped brain, vault bridge, memory providers, local LoRA, self-learning, dialectic user modeling, trajectory tooling, and `HERMES-SECOND-BRAIN-CORPUS`. | Product workflow shipped; keep measuring retrieval quality. |
| Desktop/native surfaces | Desktop app, web dashboard chat, PTY reconnect, remote backend, native Windows, Termux docs. | Vanta has desktop, companion, public API/SDK, Windows, Termux parked for physical proof. | Mostly matched; physical Termux proof remains external. |
| Safety | Command approval, profile isolation docs clarify profiles are not sandboxes, container isolation, secret-source safety, dashboard auth. | Vanta's differentiator is stronger: separate Rust kernel, scope enforcement, audit chain, sandbox/Docker/SSH, verified-done culture. | Vanta should keep safety as the wedge, not copy Hermes' softer model. |

## What This Means

Hermes is no longer just ahead on messaging breadth. It is ahead on the *operator-work surface* around persistent profiles and durable Kanban. That is the most important gap relative to Jason's Hermes/OpenClaw vision: Vanta has many primitives, but Hermes packages them into obvious workflows.

Vanta is ahead or differentiated on:
- hard Rust safety kernel and kernel-scoped execution
- verified output and audit-chain posture
- ND-first operator UX
- life/world operator thesis
- local LoRA/personal tuning path
- whole-system roadmap/launch discipline

Vanta's remaining external proof gaps from the original comparison are:
- spreadsheet/copilot execution in a real workbook host
- live proof of some reach/run-anywhere channels
- real-provider acceptance for commerce and telephony workflows added later

## Recommended Order

The profile roster, Kanban router, vault rotation, second-brain corpus, tool-surface profiles, webhook builder, dashboard slots, and delegation receipts are shipped. The 2026-07-12 refresh found two new reliability priorities: interrupted-tool effect disposition and real-headroom compaction. Four smaller cross-surface gaps follow them.

## Roadmap Action

The 2026-07-12 delta added six cards: `HERMES-DELTA-EFFECT-DISPOSITION`, `HERMES-DELTA-COMPACTION-REAL-HEADROOM`, `HERMES-DELTA-USAGE-ROUTE-LEDGER`, `HERMES-DELTA-SESSION-MODEL-SCOPE`, `HERMES-DELTA-GATEWAY-CONTEXT-REFS`, and `HERMES-DELTA-AUTH-READINESS`. Use `vanta roadmap proof-status` separately for the ten external acceptance gates.
