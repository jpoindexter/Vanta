# Hermes Current vs Vanta Vision - 2026-07-11

Source checked:
- `reference/hermes-agent` at `3b2ef789d` (`origin/main`, NousResearch/hermes-agent)
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
| Profiles | Full profile system with separate config, env, SOUL, memory, sessions, skills, cron, gateway state, aliases, import/export, descriptions for Kanban routing. | Vanta has agent/team/profile-like primitives, per-agent memory, org chart, and a parked full-isolated-profile card. New `HERMES-PROFILE-ROSTER` is `next`. | Real gap. Build visible persistent profile roster first. |
| Profile gateways | One gateway per profile plus optional multiplexing gateway with `/p/<profile>/` routing and per-profile secret/session isolation. | Vanta has messaging adapters and run-anywhere/gateway work, but not an operator-visible profile gateway model. | Fold into `HERMES-PROFILE-ROSTER` and `HERMES-KANBAN-ROUTER`; do not create separate card yet. |
| Kanban | SQLite durable task board, boards, attachments, dispatcher, profile workers, worker lanes, lifecycle tools, comments, logs, retry/reclaim/block/done. | Vanta has roadmap Kanban, Vanta Kanban, work queues, org chart, delegation, work products. `HERMES-KANBAN-ROUTER` is `next`. | Real UX/integration gap. Vanta should route durable work to profiles with evidence, not just show a board. |
| Delegation | `delegate_task` has isolated fresh child contexts, parallel batch mode, toolset restriction, summaries back to parent. Kanban handles durable multi-agent workflows. | Vanta has delegate/swarm/sidechain transcripts/build loops. `HERMES-DELEGATION-TREE-RECEIPTS` is horizon. | Mostly matched. Need receipt UX, not core execution. |
| MoA | Mixture-of-Agents is a selectable virtual provider with presets, reference models, aggregator, caching design, CLI/dashboard/desktop support. | Vanta has `SOL-MIXTURE-OF-AGENTS` shipped. | Matched enough. No new card. |
| Secrets | Bitwarden Secrets Manager, 1Password, and a secret-source plugin framework with minimal env subprocess safety and source precedence. | Vanta has scoped secret injection, profile-scoped secret resolution, scanners, key helper; external vault card is `HERMES-VAULT-SECRETS-ROTATION` horizon and older `HP-SECRETS` parked. | Real parity gap and vision-aligned. Promote after profile/Kanban unless secrets block run-anywhere. |
| Dashboard | Local web dashboard manages profiles, config, keys, MCP, models, sessions, cron, gateway, logs, analytics, chat, plus dashboard themes/plugins/slots/backend API routes. | Vanta has desktop, command center, operator home, ephemeral dashboards, and shipped bounded plugin panel slots. | Mostly matched. Keep plugin slots bounded; do not make dashboard the center. |
| Messaging/reach | Broad gateway docs and adapters across Telegram, Discord, Slack, WhatsApp, Signal, Email, Teams, Matrix, etc. | Vanta claims 20 adapters with live proof only on some; Teams and live run-anywhere proofs are parked. | Do not chase all channels now. Keep external-proof cards parked until credentials/hardware exist. |
| Learning/memory | Curator, session search, Honcho user modeling, memory providers, skill creation/improvement, trajectory tooling. | Vanta has brain, vault bridge, memory providers, local LoRA, self-learning loop, dialectic user model, trajectory tooling. `HERMES-SECOND-BRAIN-CORPUS` is next for productizing transcript/docs ingest. | Direction matched; product workflow still needed. |
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

Vanta is behind or less productized on:
- visible profile roster and profile lifecycle
- profile-routed Kanban as the main multi-agent work surface
- external vault secret sources as a first-class setup path
- dashboard plugin slot contract
- spreadsheet/copilot surface
- live proof of some reach/run-anywhere channels

## Recommended Order

1. `HERMES-PROFILE-ROSTER`
   This is the missing foundation. Without visible persistent specialists, Kanban, profile gateways, tool surfaces, and secret scoping stay abstract.

2. `HERMES-KANBAN-ROUTER`
   Build the durable work router on top of profiles. Treat it as the Hermes/OpenClaw "views" launch surface: who is working, what is blocked, what evidence exists.

3. `HERMES-VAULT-SECRETS-ROTATION`
   Move this up after profiles/Kanban if run-anywhere or multi-profile gateways need safer key distribution. Hermes now has both Bitwarden and 1Password; Vanta should not lag on privacy-first secret handling.

4. `HERMES-SECOND-BRAIN-CORPUS`
   Productize transcript/docs/notes ingestion so reference reads become reusable memory with receipts.

5. `HERMES-TOOL-SURFACE-PROFILES`
   Once profiles exist, make each profile's tool surface explainable and repairable.

6. Horizon only: webhook builder, spreadsheet copilot, dashboard plugin slots, delegation receipt tree.
   These are useful but should not precede the profile + work-router spine.

## Roadmap Action

Existing roadmap cards cover the current Hermes gaps. No new card is required from this check. The only likely ordering change is to consider promoting `HERMES-VAULT-SECRETS-ROTATION` once `HERMES-PROFILE-ROSTER` starts, because Hermes' current repo proves that vault-backed secrets are part of the profile/fleet story, not just a nice-to-have.
