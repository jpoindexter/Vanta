# Hermes release-history adoption audit — 2026-09-03

> **Frozen stable-release comparison.** This document preserves the complete
> 31-release verdict and its ten release-derived outcomes. The later
> [post-release fixed-point audit](hermes-post-release-fixed-point-audit-2026-09-03.md)
> covers the 928 commits after v0.21 and the current 209-page documentation
> index; it supersedes the current roadmap ordering and counts below without
> rewriting this frozen release corpus.

## Verdict

Vanta already implements most of the durable agent and Desktop patterns described
across Hermes's 31 published releases. The release history does not justify a
wholesale copy, a Bot Mode product pivot, provider or messaging breadth for its own
sake, or a second chat-shaped truth store.

The comparison and three independent adversarial checks found ten distinct Vanta
outcomes worth recording:

- one confirmed security boundary moves to **Next**;
- nine useful but evidence-gated Agent/Desktop improvements remain **Parked**;
- the voluntary `GROW-01` evidence lane moves from Horizon to Parked because the
  operator explicitly deferred unfamiliar-user work while product hardening
  continues.

This is roadmap work only. It does not claim that any new outcome is implemented,
packaged, released, or externally verified. No Hermes source, runtime, tests,
assets, branding, plugins, skills, credentials, or checkout entered Vanta.

## Frozen source corpus

The audit read every release body returned by GitHub's public release API and the
current v0.21 release page:

- [Hermes Agent v0.21.0 / v2026.8.31](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.31)
- [All Hermes Agent releases](https://github.com/NousResearch/hermes-agent/releases)
- [GitHub release API](https://api.github.com/repos/NousResearch/hermes-agent/releases?per_page=100&page=1)

Snapshot facts at review time:

| Fact | Observed value |
| --- | --- |
| Published release bodies | 31 |
| First release in corpus | `v2026.3.12` / v0.2.0 |
| Latest release in corpus | `v2026.8.31` / v0.21.0 |
| v0.21 tag object | `6e8f8418e6378eb2617e4de074e13dedd091b8af` |
| v0.21 release commit | `29112bef099274229cadff79cdff7bf7b99c4b77` |
| Hermes `main` at final refresh | `561b053f794a1781868bb032029d589c67708119` |
| Commits on `main` after v0.21 | 928 |
| Release-API response SHA-256 | `e4f54d1fc2ae477ffdeba0040dd0881e014fe78391db709117906580f465c1da` |

The 928 post-release commits are outside this release-history verdict. The release
is the requested stable comparison point; it is not the current Hermes source
head. Release notes are also product claims, not independent proof that every
described Hermes behavior executes correctly.

## Method

1. Inventory all release tags, dates, release names, curated highlights, feature
   sections, bug-fix sections, security notes, and patch-rollup descriptions.
2. Group repeated work into durable capabilities instead of counting the same
   lineage once per release.
3. Compare each capability with Vanta's canonical `roadmap.json` and the supported
   TypeScript/Desktop source where a present-behavior claim mattered.
4. Reuse an existing owner when its retained Done contract already covers the
   outcome. Add a card only when the user outcome, boundary, dependency, and proof
   are distinct.
5. Reject breadth that does not improve Vanta's local-first, task-first,
   neurodivergent-supportive operator model.
6. Keep the open queue at 12 and never promote a release-note analogy to shipped.

## Complete published-release inventory

Every published release body was read. Patch tags that explicitly defer their
curated notes to the next minor release were still inventoried; their named changes
were compared, and their full feature window was assessed through that subsequent
curated release.

| Release | Published | Dominant useful signal | Vanta disposition |
| --- | --- | --- | --- |
| v0.21.0 (`v2026.8.31`) | 2026-08-31 | remembered cron, live child steering, MCP command center, approval dry-run, stall diagnostics, resume idempotence, in-app browser control, model overrides/privacy, protected instruction writes | ten bounded roadmap outcomes; reject Bot Mode, pets, provider breadth |
| v0.20.6 (`v2026.8.27`) | 2026-08-27 | real-profile consent, MCP catalog/health, web cache, tool search, keychain storage, updater and cron recovery | browser/connection/deadline cards already cover most; MCP fleet delta retained |
| v0.20.5 (`v2026.8.19`) | 2026-08-21 | fuzzy CLI, execution discipline, multi-question clarify, worktree hygiene, cron memory | mostly shipped; cron continuity delta retained |
| v0.20.4 (`v2026.8.18`) | 2026-08-18 | Desktop translucency, skill-install advisory scanning, cron media/missed-fire hardening, SessionDB contention | existing Desktop/security/reliability owners; no cosmetic copy |
| v0.20.3 (`v2026.8.16.2`) | 2026-08-17 | MCP protocol update, subprocess environment ownership, cron continuity/self-heal, remote connection repair | existing MCP/environment/deadline cards; continuity delta retained |
| v0.20.2 (`v2026.8.16`) | 2026-08-16 | Desktop connection registry, profile-scoped refresh, MCP health/deep links, cron/auth/installer hardening | existing connection lifecycle plus MCP fleet delta |
| v0.20.1 (`v2026.8.13`) | 2026-08-13 | broad stabilization rollup across Desktop, gateway, installer, tools, providers | evaluated through v0.21 curated rollup; no separate card |
| v0.20.0 (`v2026.8.3`) | 2026-08-03 | streaming voice, wake words, citations, signed webhooks, Desktop artifacts/quick entry, A2A, redirects, self-repair, compaction, approvals, performance | most shipped; quick capture retained; hosted/breadth features rejected |
| v0.19.1 (`v2026.7.30`) | 2026-07-30 | gateway, voice, Desktop, installer and media reliability rollup | evaluated through v0.20; existing owners |
| v0.19.0 (`v2026.7.20`) | 2026-07-20 | first-token and Desktop performance, smart approvals, secret sources, durable delegation/delivery, model effort, session export | Vanta already has measured TTFT, approvals, vault, receipts, exports and effort controls |
| v0.18.2 (`v2026.7.7.2`) | 2026-07-08 | packaged WhatsApp dependency repair | no Vanta outcome |
| v0.18.1 (`v2026.7.7`) | 2026-07-08 | installer/updater, dashboard, WhatsApp, MCP and provider stabilization | evaluated through v0.19; existing owners |
| v0.18.0 (`v2026.7.1`) | 2026-07-01 | mixture-of-agents, verification receipts, learn/journey, background fan-out, Desktop projects, drain coordination | verification, skills, delegation, projects and shutdown already owned; no MoA product pivot |
| v0.17.0 (`v2026.6.19`) | 2026-06-19 | richer Desktop, async subagents, automation blueprints, memory batches, skills browsing, messaging polish | existing Desktop/delegation/workflow/memory owners |
| v0.16.0 (`v2026.6.5`) | 2026-06-06 | native Desktop, remote connections, setup, fuzzy model picker, undo, interface selection | existing Desktop shell, connection, setup, model and rewind owners |
| v0.15.2 (`v2026.5.29.2`) | 2026-05-29 | plugin-manifest packaging fix | no Vanta outcome |
| v0.15.1 (`v2026.5.29`) | 2026-05-29 | loopback auth repair, explicit insecure opt-in, MCP command resolution, worker termination | existing local-origin, MCP, worker and package gates |
| v0.15.0 (`v2026.5.28`) | 2026-05-28 | decomposition, Kanban, deterministic session search, prompt-injection defense, secrets, TUI orchestration, MCP picker | existing code-size, graph, search, trust, vault, TUI and MCP owners |
| v0.14.0 (`v2026.5.16`) | 2026-05-16 | OAuth proxy, browser performance, cold start, handoff, mutation verifier, LSP, computer use | existing provider/browser/performance/handoff/verification/LSP owners |
| v0.13.0 (`v2026.5.7`) | 2026-05-07 | goal persistence, restart survival, checkpoints, no-agent monitors, platform allowlists, ACP steer/queue | existing goals, continuity, rollback, monitor, policy and queue owners |
| v0.12.0 (`v2026.4.30`) | 2026-04-30 | memory curator, self-improvement, skills, providers, TUI, model catalog, multimodal routing, observability | existing memory/self-learning/skills/provider/TUI/vision/receipt owners |
| v0.11.0 (`v2026.4.23`) | 2026-04-23 | Ink TUI, transports, plugins, mid-run steering, hooks, webhooks, delegation and auxiliary models | most shipped; child-specific live steering remains narrower gap |
| v0.10.0 (`v2026.4.16`) | 2026-04-16 | managed tool gateway | reject hosted gateway dependency; preserve Vanta kernel boundary |
| v0.9.0 (`v2026.4.13`) | 2026-04-13 | local dashboard, fast mode, background monitoring, context engines, proxy, backup/debug, security | existing local UI, speed, monitors, compression, backup and diagnostics owners |
| v0.8.0 (`v2026.4.8`) | 2026-04-08 | background completion, live model switching, inactivity timeouts, approvals, MCP OAuth/malware scan, logs/config | existing background/model/deadline/approval/MCP/security owners |
| v0.7.0 (`v2026.4.3`) | 2026-04-03 | pluggable memory, credential pools, browser sessions, inline diffs, API continuity, MCP from clients, gateway and exfiltration hardening | existing ports/vault/browser/diff/continuity/MCP/trust owners |
| v0.6.0 (`v2026.3.30`) | 2026-03-30 | isolated profiles, MCP server mode, containers, provider fallback, Telegram webhook controls, search backends | existing profiles/MCP/sandbox/fallback/gateway/search owners |
| v0.5.0 (`v2026.3.28`) | 2026-03-28 | Hugging Face provider, Telegram topics, plugin hooks, model reliability, supply-chain hardening | existing providers/topics/hooks/model guidance/security gates |
| v0.4.0 (`v2026.3.23`) | 2026-03-24 | API/jobs, messaging, context references, MCP management, caching/compression, streaming, queue/permissions/browser/cost | existing public API, jobs, gateway, context, MCP, cache, queue and usage owners |
| v0.3.0 (`v2026.3.17`) | 2026-03-17 | streaming, plugins, native providers, approvals/stop, memory, voice, parallel tools, PII redaction, CDP, ACP, persistent shell | existing streaming/plugin/provider/trust/memory/voice/tool/browser/ACP/shell owners |
| v0.2.0 (`v2026.3.12`) | 2026-03-12 | gateways, MCP, skills, centralized providers, ACP, themes, worktrees, checkpoints and tests | Vanta foundations already cover the durable parts; reject skins as priority |

## Confirmed Next gap

### `CONTROL-PLANE-INSTRUCTION-WRITE-BOUNDARY`

Hermes v0.21 treats standing agent instructions as protected control-plane
material. Vanta already has meaningful adjacent protection:

- `.env` and kernel authentication/audit files are denied;
- `.vanta`, `.mcp.json`, and Git hooks require exact approval for direct file
  writes and are hidden from subprocess sandboxes;
- agent-authored skill mutations use a separate approval queue;
- `TRUST-02` has executed evidence for its bounded hook, credential, audit, and
  local-API contract.

The current `vanta-ts/src/tools/project-security-path.ts` classifier does not,
however, include ordinary repository `AGENTS.md`, `CLAUDE.md`, `VANTA.md`, nested
agent definitions, or verification-policy files. Those documents can alter future
agent behavior while looking like ordinary source edits. The new card requires one
canonical, alias-safe, cross-host exact-approval boundary and executed denial,
approval, activation, restart, and adversarial fixtures.

This is a confirmed code-path gap. It is not evidence that an exploit occurred or
that all instruction-like files should become unwritable.

## Parked Agent and Desktop improvements

### `MCP-FLEET-HEALTH-CONTEXT-BUDGET`

Vanta's shipped MCP panel already lists servers, connection state, tools,
reconnect, and elicitation. The missing product layer is proactive, local-only
fleet health: authentication expiry, effective project scope, bounded health
checks, schema context cost, recent calls/errors/latency, and explicit preview for
paste/file/deep-link imports. It re-enters only when server count, auth failures,
or measured schema cost justify dashboard complexity.

### `MODEL-METADATA-OVERRIDE-PROVENANCE`

Vanta's capability matrix prevents unsupported parameters, and its provider-aware
Desktop/TUI controls are shipped. Hermes adds operator-correctable model metadata.
The Vanta card adds provenance, scope, precedence, and freshness so an override
cannot silently become a new source of false capability or cost claims.

### `MODEL-DATA-USE-DISCLOSURE`

Provider data-use disclosure is independently prioritized from catalog correction.
It requires dated, tier-specific sources and an explicit unknown state before any
surface claims whether submitted content may be retained or used for training. No
current provider-policy corpus was audited here, so this card remains parked rather
than turning an unsourced warning into product truth.

### `SCHEDULE-CONTINUITY-CHANGE-SUPPRESSION`

Vanta already ships durable cron, loop state, watchers, receipts, and
provider-aware timeouts. Hermes's newer cron lineage adds a distinct outcome:
bounded per-job continuity plus a deterministic no-change path that avoids a model
call and duplicate notification. It stays parked until an observed recurring task
actually repeats work or loses material context.

### `DELEGATION-LIVE-STEERING-BUDGET`

Vanta already ships task create/get/list/update/stop/output, agent messages, live
sidechain output, receipts, cost attribution, and graph replay. The missing bounded
contract is steering a running child with a sequenced acknowledgement, retaining a
truthful partial result on stop, optional typed output, and downward-only budgets.
Hermes's much larger default iteration/concurrency limits are explicitly not
copied.

### `DESKTOP-QUICK-CAPTURE`

The useful Desktop pattern is a small, optional, keyboard-first capture surface
that enters Vanta's existing queue or task inbox. It must not launch a second agent,
create another session truth, or execute on capture. It re-enters only if cold-user
evidence shows full-workbench launch friction or real capture loss.

### `APPROVAL-POLICY-DRY-RUN`

Vanta explains an approval verdict once an action reaches the prompt, but it lacks
a side-effect-free query over the production policy path. This card provides a real
allow/ask/block preflight without execution, reusable approval, idempotency claim,
or model-authored safety guess.

### `STALL-BOUNDARY-DIAGNOSTIC-CAPTURE`

Vanta detects stalls and can assemble a redacted repro packet after failure. The
missing diagnostic contract captures bounded process, worker, wait-site, deadline,
and progress evidence at the instant the watchdog fires without delaying the stop
boundary or retaining conversation content.

### `SESSION-RESUME-PERSISTENCE-IDEMPOTENCE`

The current filesystem session store overwrites a complete message snapshot, which
is a strong code-path safeguard against re-appending loaded rows. The missing proof
is a cross-host resume-to-save fixture over repeated resumes, crash checkpoints,
forks, imports, compaction, and any future append-oriented backend. This is parked
proof work, not a claim that current sessions are duplicating.

## Already covered — do not duplicate

| Hermes release lineage | Existing Vanta owner evidence |
| --- | --- |
| fuzzy command/model selection, rich status, context and usage | `VANTA-QUICK-OPEN`, `DESKTOP-P9`, `STATUS-VERBOSITY-CONTEXT`, `VANTA-USAGE-MERGED`, `LIVE-CONTEXT-COST-INSPECTOR` |
| large tool-result spill and rich MCP output | `VANTA-TOOL-RESULT-DISK`, `MEM-TOOL-OUTPUT-DELIVERY`, `VANTA-MCP-RICH-OUTPUT`, `VANTA-MCP-RESULT-SIZE` |
| structured output and multi-question clarification | `VANTA-JSON-SCHEMA`, `VANTA-ASK-USER-TOOL` |
| event cursors, replay, timelines and durable receipts | `HARNESS-EVENTS-WAIT`, `SCHEMA-TRANSITION-TIMELINE`, `GRAPH-OPERATOR-REPLAY-HANDOFF`, `TRUST-04` |
| emergency stop, queue, steer and session priority | `GLOBAL-PAUSE-NEW-WORK-SENTINEL`, `GATEWAY-SESSION-MANAGER`, `DESKTOP-QUEUED-TURN-EDITOR`, `DESKTOP-PINNED-TASK-ORDER` |
| browser observation/action and authenticated workspace | `BROWSER-WORKFLOW-ACTION-BOUNDARY`, `BROWSER-AUTHENTICATED-WORKSPACE`, `DESKTOP-CONTROL-BOUNDARY` |
| secrets, redaction, process environments and local API origin | `TRUST-01`, `TRUST-02`, `OP-SECRET-SCOPE`, `DESKTOP-LOCAL-ORIGIN-SECURITY-PROOF`, `SANDBOX-EGRESS-CREDENTIAL-BROKER` |
| stable Desktop updates, OAuth, crash/power recovery and permissions | `DESKTOP-NATIVE-RESILIENCE-SHELL`, `DESKTOP-RELEASE-CANDIDATE-PROVENANCE`, `DESKTOP-CONNECTION-PROJECT-LIFECYCLE` |
| measured first token, Desktop rendering and package performance | `QUICKSILVER-TTFT-PERF-HARNESS`, `QUICKSILVER-STARTUP-CRITICAL-PATH`, `DESKTOP-VISUAL-PERFORMANCE-REGRESSION-GATES` |
| memory, compaction, checkpoints, continuity and session export | existing Memory, `RUN-RESUME`, `VANTA-POST-COMPACT-RESTORE`, `HARNESS-DURABLE-PRECOMPACTION-CHECKPOINT`, export and rollback cards |
| skills, plugins, hooks, MCP, ACP, A2A and worktrees | existing shipped extension and orchestration stack, including explicit-empty MCP and worktree isolation |
| voice, wake word, streaming speech and multimodal input | existing shipped voice, wake, streaming TTS, vision and attachment cards |

The existence of a shipped record proves only that record's retained Done
contract. It does not prove every Hermes option, provider, platform, or UI flourish.

## Explicit non-adoptions

- Bot Mode, bot avatars, group-room product identity, peer DMs as a second truth
  store, or an AI-company/fleet metaphor;
- terminal pets, skin/theme breadth, cosmetic translucency, achievements, or
  novelty before cold-user evidence;
- paid subscriptions, top-ups, hosted Nous services, managed tool gateways,
  residential proxies, paid browser infrastructure, or billing surfaces;
- provider, model, messaging-platform, cloud-host, enterprise-admin, telephony,
  commerce, crypto, and marketing breadth without a Vanta operator job;
- CAPTCHA or anti-detection bypass, stealth automation, raw unrestricted CDP,
  silent live-profile copying, or action jitter intended to evade a service;
- automatic MCP/plugin/skill installation, unsigned deep links, or diagnostics
  upload without exact preview and authority;
- Hermes's Python architecture, source code, defaults, naming, branding, assets,
  tests, fixtures, docs text, plugins, skills, or release machinery;
- model council and other features explicitly reverted in Hermes v0.21;
- GitHub Actions spend, release, deployment, notarization, publication, or
  participant outreach.

## Resulting dependency order

1. Implement `CONTROL-PLANE-INSTRUCTION-WRITE-BOUNDARY` as the first internal
   security fix.
2. Keep `BROWSER-WORKFLOW-ACTION-BOUNDARY` as the other executable product
   boundary; completing the first card does not authorize browser autonomy.
3. Keep the two unfamiliar-user Desktop proof cards visible as parked external
   gates at the operator's request; do not pretend they can be completed without
   the volunteer run.
4. Re-enter the nine new parked outcomes only when their exact card trigger is
   observed.
5. Keep `GROW-01` parked and zero-cost until the operator resumes voluntary user
   evidence work.

At this frozen release-only reconciliation point, the canonical roadmap contained
1,356 cards: 1,288 shipped, 4 Next, 8 Horizon, and 56 Parked. The subsequent
current-main fixed-point audit supersedes those current-state counts. These
figures are roadmap state, not an implementation or release claim.

## Triple-check corrections

Three independent skeptical passes rechecked release coverage, duplicate ownership,
dependencies, projection order, and live repository claims. They produced these
corrections before closeout:

- MCP install links now require a verified publisher signature, allowed origin,
  expiry, nonce/replay defense, exact confirmation, and the existing deep-link and
  Desktop MCP owners; unsigned links remain read-only previews.
- Model overrides and provider data-use disclosure are separate outcomes with
  separate re-entry triggers.
- Schedule, delegation, and quick-capture cards now name their direct at-most-once,
  schema/budget, draft, and attachment owners; delegation also requires pre-spawn
  batch validation and visible truncation markers.
- Approval dry-run, stall-boundary diagnostics, and resume persistence idempotence
  are recorded rather than hidden under broader shipped claims.
- Both roadmap generators now share one dependency-aware priority order, validate
  the real case-insensitive-ID/dependency graph before generation, and report the
  Desktop App track in open counts; the normal roadmap schema suite also parses the
  current repository root instead of only fabricated fixtures.
- A live website dependency audit found newly disclosed `fast-uri` and `qs`
  advisories beyond the prior narrow exception. Their free patched releases are
  pinned locally; the remaining result returns to the exact two-advisory,
  19-package `image-size` exception.
