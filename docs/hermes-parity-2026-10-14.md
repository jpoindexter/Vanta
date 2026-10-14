# Hermes parity review, 2026-10-14

Scope: what to bring to parity in Vanta from NousResearch/hermes-agent (origin/main `58560bf0c0`, 2026-10-14, v0.22.0 line), and what not to. Two independent products compared by capability. The only shared lineage is that `desktop-next/apps/desktop` and `apps/shared` began as a one-time copy of Hermes `apps/desktop` + `apps/shared` at `6e7b83a2f1` (`desktop-next/NOTICE.md`); the Vanta runtime (`vanta-ts`) and Rust kernel have no shared history with Hermes.

Basis tags: **cr** = code-read (rg/ls/sed of the file named), **doc** = taken from a Hermes or Vanta doc and not confirmed in code, **x** = executed. **Nothing in this review was executed (x = none).** All Vanta paths are relative to `vanta-ts/src/` unless they start with `src/` (Rust kernel), `desktop-next/`, or `docs/`.

## 1. Method and what was NOT checked

Method
- Hermes: read at `origin/main` only, via `git show` / `git ls-tree` (clone not modified). Read: README, AGENTS.md, toolsets.py, `website/docs` (security, configuration, curator, kanban, goals, loops, heartbeat, MoA, credential pools, vault, tool search, sessions, overview), cli-config.yaml.example (auxiliary block), `agent/auxiliary_task_config.py`, head of `agent/moa_loop.py`, `tools/skills_guard.py`, `tools/approval_smart.py`, `tools/osv_check.py`. Directory listings of `tools/ agent/ gateway/ cron/ plugins/ acp_adapter/ evals/ tui_gateway/ apps/`.
- 387 commits in `6e7b83a2f1..origin/main` classified by subject (not diff-read, except spot checks). 138 touch `apps/desktop|apps/shared`.
- Vanta: for every row, `ls`/`rg`/`sed` for the file or function. "not found" means an rg over `vanta-ts/src` found nothing for the terms I tried; it does not prove absence under another name.
- Built on `docs/upstream-adoption-matrix-2026-10-13.md` (section 7 says where I agree/disagree) and the prior Hermes audits in `docs/hermes-*-audit-*.md` (not re-done).

NOT checked (be honest)
- Nothing run: no tests, no app, no Electron, no live provider or channel. Channel "live" status is unverified (it is an operator-run ledger, `gateway/channel-verify.ts`; no ledger exists in this worktree).
- Hermes source read only for the ~10 files above; gateway, cron, ACP, kanban dispatcher, browser, TTS/STT, plugins, hosted rooms and the Python state DB were read from docs and file names only. Hermes benchmark numbers are Hermes's own claim, not reproduced.
- Vanta `tools/edit-file.ts` fuzzy-match/stale-read behaviour; per-sender isolation in group chats (gateway); TTS/STT provider quality; i18n; update/doctor; web-search provider live behaviour; kernel `safety.rs` coverage beyond the lines cited.
- Roadmap statuses in `roadmap.json` are claims; I did not audit them (one lag found: see section 8).
- Effort figures are my estimates (si-outside-view: ranges, correction for hidden costs), not measured.

## 2. Top 3 recommendations (smallest effort first)

| # | Recommendation | Effort (best / realistic / worst) | Hidden costs | Done (one sentence, executed) |
|---|---|---|---|---|
| 1 | **OSV malware check before an `npx`/`uvx` MCP server is spawned.** Hermes queries api.osv.dev for `MAL-*` advisories and refuses launch (`tools/osv_check.py`, fail-open, cached). Vanta binds approval to the launch command hash (`mcp/server-approval.ts`) but never asks whether the package is known-malicious; spawn is at `mcp/client.ts:201`. | S: 2h / 4-6h / 1.5d | Adds an outbound host to a product whose proofs say "nothing phones home" (`desktop-crypto-free-proof`, network audit, CUTOVER V-021): needs opt-in or an egress-policy entry and a doc line. Hermes had a 779K-DNS-query/16h revival-loop incident (#75485) so a persisted verdict cache is mandatory, not optional. Fail-open vs fail-closed is an owner decision. Parse npx/uvx/bunx/pnpm-dlx forms. | A fixture MCP server whose npx package is flagged `MAL-*` by a stub OSV endpoint is refused before spawn with the advisory id, a clean package spawns, an unreachable endpoint logs and proceeds, and 10 reconnects cause 1 query. |
| 2 | **Route the background learning forks to a cheaper model, after making their spend visible.** Vanta already has the env-ladder (`routing/aux-map.ts`) but only `session.ts:136` (summarizer), vision tools, `web_fetch` extract and TTS use it. The post-turn forks (skill review, session memory, memory extractor, dialectic, brain learn, critic, completion verifier) all take `opts.provider` = the main model (`session/background-learning.ts:39-220`). `cost/route-ledger.ts` records agent/provider/model but no purpose, so today nobody can see what share of spend these are. | S: 3h / 0.5-1d / 2d | A cheaper model writes skills/memory worse: gate on the existing eval corpus (`mem-eval/`, `skill-eval/`) before defaulting anything. Second provider credential. Hermes itself defaults every aux task to the main model (`configuration.md` "Auxiliary Models"); savings only exist if the owner configures a cheap model. | With `VANTA_MODEL_LEARN` set, a real session's post-turn review fork writes a `route-usage-ledger.jsonl` row naming the cheap model and `purpose=learn` while main turns keep the main model, and with it unset all rows are byte-identical to today. |
| 3 | **A model-callable `session_search` tool.** Hermes: `tools/session_search_tool.py` over FTS5, no LLM. Vanta: search exists for humans only (`sessions/search.ts` linear scan of the 50 newest session JSON files; `repl/sessions-search-cmd.ts`; desktop `sessions-control-api.ts`); `tools/all-tools` has no tool that searches past Vanta sessions (`tools/agent-session.ts` lists other agents' sessions). | S-M: 3h / 0.5-1d / 2d | JSON scan will not scale past a few hundred sessions: either raise the window and measure, or add an index (do NOT migrate to SQLite now: stack lock). Results re-enter the prompt: treat as untrusted data (TRUST-05) and redact. | In a real chat, "what did we decide about X last week" calls `session_search` and returns at least one cited snippet (session id and turn) from an earlier session, read-only, no approval prompt. |

Hidden: **1 more PARITY-NOW** (`vanta migrate hermes` cannot read Hermes's `config.yaml`, row 94) and **15 PARITY-LATER** rows, plus the SKIPs. Finish #1-#3 before opening any of them (nd-choicereduce).

## 3. Matrix

Status: HAS / PARTIAL / MISSING / DIFF (different by design) / N/A. Verdict: NOW / LATER / SKIP. Effort S (<1d), M (1-3d), L (>3d), `-` none.

| # | Hermes feature | Hermes evidence | Vanta equivalent | Status | Verdict | Why | Effort |
|---|---|---|---|---|---|---|---|
| 1 | Tool search (deferred schemas) | `tools/tool_search.py`, docs `tool-search.md` | `tools/tool-search.ts`, `agent/tool-scope.ts` | HAS cr | SKIP | Exists; quality unmeasured (card TOOL-DISCOVERY-SCALE-QUALITY parked). Agree with adoption matrix row 6 | - |
| 2 | Tool output limits, spill, offload | `tools/tool_output_limits.py`, `tool_result_storage.py` | `compress/result-offload.ts`, `tools/retrieve-original.ts`, `tools/bash-output-limit.ts` | HAS cr | SKIP | Equivalent incl. expand-on-demand | - |
| 3 | Fuzzy patch, escape-drift autocorrect, stale-file guard | `tools/fuzzy_match.py`, `escape_drift_autocorrect.py`, `file_state.py` | `tools/edit-file.ts` (148 lines; no fuzzy/stale terms found) | PARTIAL cr | LATER | Measure edit-failure rate in real runs first; do not port speculatively | S |
| 4 | Todo, clarify | `todo_tool.py`, `clarify_tool.py` | `tools/todo.ts`, `ask-user.ts`, `clarify.ts` | HAS cr | SKIP | - | - |
| 5 | Persistent goals `/goal` (judge-driven) | `goals.md`, `gateway/slash_commands_goals.py` | `repl/catalog.ts:57`, `goals/`, kernel `src/goals.rs` | HAS cr | SKIP | Equivalent; kernel-backed | - |
| 6 | `/loop` recurring in-session | `loops.md` | `loop/` (runner, stop, verify), `repl/catalog.ts:69` | HAS cr | SKIP | - | - |
| 7 | `/heartbeat` idle re-entry | `heartbeat.md` | `heartbeat/runtime.ts` is the company-engine wakeup, not session re-entry | DIFF cr | SKIP | `/loop` + schedules cover it; Rule of 3 | - |
| 8 | `execute_code` with tools via RPC | `code_execution_tool.py`, `code_execution_rpc.py` | `tools/run-pipeline.ts`, `workflow/rpc-pipeline.ts`, `tools/run-code.ts` (sandboxed) | HAS cr | SKIP | Shipped as SCRIPT-RPC-PIPELINE | - |
| 9 | Delegation, async children, worktree subagents | `delegate_tool*.py`, `async_delegation.py`, `subagent_worktree.py` | `tools/delegate.ts`, `swarm`, `team`, `subagent/async-delegate.ts`, `worktree/manager.ts`; kernel spawn-depth ceiling `subagent/spawn-guard.ts:7-27` | HAS cr | LATER | Per-child time/cost cap not found (DELEGATION-LIVE-STEERING-BUDGET parked). **Disagree with adoption matrix row 7 "no depth cap": depth is kernel-enforced** | M |
| 10 | Checkpoints and rollback | `tools/checkpoint_manager.py` | `repl/checkpoint.ts`, `rewind-cmd.ts`, `sessions/file-checkpoint.ts` | HAS cr | SKIP | - | - |
| 11 | LSP diagnostics in edit loop | `agent/lsp`, `lsp.md` | `lsp/`, `lsp_*` tools | HAS cr | SKIP | - | - |
| 12 | Background process manager | `process_registry*.py` | `tools/bg-tasks.ts` (`bg_list`, `bg_status`) | HAS cr | SKIP | - | - |
| 13 | `@file`/`@diff`/`@url` context refs | `context-references.md`, `agent/context_references.py` | `context/ref-expand.ts` | HAS cr | SKIP | - | - |
| 14 | Unified turn deadline and stall contract | `agent/deadline.py`, `gateway/session_stall.py` | none as one contract (HARNESS-UNIFIED-DEADLINE-FAILURE-CONTRACT parked) | MISSING cr | LATER | Agree with adoption matrix row 4; silent hangs are a trust problem | M |
| 15 | Denial circuit-breaker | `tools/approval.py:77-94` (per adoption matrix) | `permissions/denial-history.ts` is read-only | MISSING cr | LATER | Agree with matrix row 10; small | S |
| 16 | Repetition / empty-response guards | `agent/repetition_guard.py`, `empty_response_guard.py` | `agent/tool-budget.ts`, `providers/tool-call-repair.ts`, `tool-retry.ts` | PARTIAL cr | LATER | Verify with a stuck-loop trace before adding | S |
| 17 | MCP/tool JSON-schema `$ref` resolution and sanitizing | `tools/schema_sanitizer.py`, `tools/arg_coercion.py`, commits `8f2c147c57`, `8f81791172`, `8636ccc4c5` | no `$ref` handling found in `mcp/ providers/ tools/ agent/` | MISSING cr | LATER | Correctness risk with untrusted MCP schemas on strict providers (Gemini); fix when an MCP server breaks | S |
| 18 | Provider breadth (~45 plugins) | `plugins/model-providers/*` | `providers/catalog.ts` (26 ids + `custom`), `user-providers.ts`, `bedrock-config.ts` | PARTIAL cr | SKIP | DECISIONS 2026-06-09: curated is enough; `custom` endpoint covers the long tail | - |
| 19 | Fallback providers | `fallback-providers.md` | `providers/fallback.ts` | HAS cr | SKIP | - | - |
| 20 | Credential pools / key rotation | `credential_pool.py` | `credentials/pool.ts`, `providers/auth-conflict.ts` | HAS cr | SKIP | - | - |
| 21 | **Auxiliary models (per-task routing)** | `agent/auxiliary_*.py`, `auxiliary_task_config.py`, config `auxiliary.<task>` | `routing/aux-map.ts`, `vision.ts`, `extract.ts`, `tts.ts`, `session.ts:136`; background forks unrouted (`session/background-learning.ts`); `sessions/auto-title.ts` has no caller | PARTIAL cr | NOW | Rec #2 | S |
| 22 | **Mixture of Agents** | `agent/moa_loop.py` (1550 lines), `mixture-of-agents.md` | `tools/council.ts` (personas, one provider: `:38-45`), `agent/advisor.ts` (`VANTA_ADVISOR_MODEL`) | MISSING cr | LATER | Section 6 | M |
| 23 | Reasoning effort, fast mode, service tier | config `agent.reasoning_effort` | `providers/effort.ts`, `fast-mode.ts`, `model-settings.ts`, `adaptive-effort.ts` | HAS cr | SKIP | - | - |
| 24 | 1h prompt cache | docs | `providers/anthropic-convert.ts:8-22` | HAS cr | SKIP | - | - |
| 25 | OpenAI-compatible endpoint, subscription proxy | `api-server.md`, `subscription-proxy.md` | `proxy/server.ts` (`vanta proxy`), `public-api/` | HAS cr | SKIP | - | - |
| 26 | Local model management | `local-models.md` | `runtime-controller/`, `runtime-engine/`, `model-download/` | HAS cr | SKIP | - | - |
| 27 | Codex app-server runtime | `codex-app-server-runtime.md` | `worker-runtimes/` (Codex, Claude Code, Hermes as ticket workers) | DIFF cr | SKIP | Vanta's seam is the worker registry behind the call_agent gate | - |
| 28 | Bounded MEMORY.md/USER.md + nudges | `memory.md`, `agent/memory_manager.py` | `brain/`, `memory/`, `tools/brain.ts` | DIFF cr | SKIP | Different design, equivalent job | - |
| 29 | Memory provider plugins (honcho, byterover, retaindb, mem0) | `plugins/memory/*` | `memory/mem0-adapter.ts`, `memanto-adapter.ts`, `msa-provider.ts`, `operator-profile/dialectic.ts` | PARTIAL cr | SKIP | Rule of 3; adapters exist | - |
| 30 | **Session search tool (FTS5)** | `tools/session_search_tool.py`, `hermes_state_fts.py` | `sessions/search.ts` (human UI only, 50-session scan) | PARTIAL cr | NOW | Rec #3 | S |
| 31 | SQLite state DB, WAL, repair | `hermes_state_*.py` | JSON sessions with `sessions/atomic-persistence.ts` (last-good file, conflict error); LOCAL-STATE-ATOMIC-RECOVERY-BOUNDARY next | DIFF cr | SKIP | No users, stack lock; the atomic-write card is the right scope | - |
| 32 | Context compression (lean tail, micro, native) | `agent/context_compressor*.py`, `micro_compaction.py`, `native_compaction.py` | `compress/` (30 files), `context/graduated-compaction.ts`, `time-microcompact.ts` | HAS cr | SKIP | Equivalent, mostly model-free | - |
| 33 | Learning loop (skills from experience) | `agent/background_review.py`, `review_engine.py`, `learning_graph.py` | `review/background-review.ts`, `learning/loop.ts` (propose, eval-gate, adopt, measure) | HAS cr | SKIP | Vanta's eval-gate is stronger | - |
| 34 | Skill vs memory routing of learned items | commit `562ee8ab` (via `docs/hermes-post-release-fixed-point-audit-2026-09-03.md`) | LEARNING-SKILL-MEMORY-ROUTING parked | MISSING doc | LATER | Already carded | S |
| 35 | agentskills.io compatibility | `skills.md` | `skills/agentskills-format.ts` | HAS cr | SKIP | - | - |
| 36 | Skills hub, multi-source | `tools/skills_hub_*.py` | `skills/hub.ts`, `registry-client.ts`, `docs/multi-source-skill-hub.md` | HAS cr | SKIP | - | - |
| 37 | Skills guard: trust-tiered install policy, exfil/persistence/destructive categories | `tools/skills_guard.py` (policy matrix builtin/trusted/community/agent-created) | `skills/gating.ts` `scanForInjection`; `registry-client.ts` sha256 + `packageRisks`; write-approval blocks on hits | PARTIAL cr | LATER | Injection-only scan; no source-trust tiers. Do when community installs are real | M |
| 38 | Skill curator | `agent/curator.py`, `curator.md` | `skills/curator.ts` (30d stale, archive learned only, overlaps reported, never auto-delete) | HAS cr | SKIP | Hermes LLM consolidation is opt-in/off by default; skip | - |
| 39 | Bundled skill breadth (58 bundled + 153 optional) | `skills/`, `optional-skills/` | 51 `SKILL.md` in `vanta-ts/skills-library` + 4 skill packs at root | PARTIAL cr | SKIP | Hub gives access; count is not a goal | - |
| 40 | Cron: NL schedules, delivery, pause/resume/edit | `cron/*`, `cron.md` | `schedule/` (`cron.ts`, `durable-cron.ts`, `cron-edit.ts`, `at-most-once.ts`), `tools/cron.ts` (create/list only), desktop shim pause/resume/trigger (server-gaps doc) | HAS cr | SKIP | - | - |
| 41 | Script-only (no-agent) cron | `cron/scheduler_script.py`, guide `cron-script-only` | `schedule/script-run.ts` | HAS cr | SKIP | - | - |
| 42 | Automation blueprints / suggestions | `cron/blueprint_catalog.py`, `suggestions.py` | `automation-blueprints/`, `blueprint/` | HAS cr (blueprints) | SKIP | Suggestions: not found; not needed | - |
| 43 | Unattended approval policy (`cron_mode: approve`) | `security.md` approvals table | `schedule/AGENTS.md` denies human approvals; headless launches only under a saved Always rule (`docs/worker-runtimes-2026-10-13.md`) | DIFF cr | SKIP | Hermes can auto-approve everything in cron: contradicts kernel model | - |
| 44 | Cron incidents, delivery-truth diagnostics | `cron/incidents.py`, `scheduler_diagnostics.py` | SCHEDULE-CONTINUITY-CHANGE-SUPPRESSION parked | MISSING doc | LATER | Already carded | M |
| 45 | Messaging platform breadth (~31) | `gateway/platforms`, `plugins/platforms` | `gateway/platforms/registry.ts` 22 catalog entries, each with an adapter file | PARTIAL cr | SKIP | Missing: dingtalk, wecom, yuanbao, simplex, homeassistant, raft, photon, buzz. Regional or fleet; Rule of 3. **Corrects prior memory (~13 / 5 live): 22 adapters; live count unverified** | - |
| 46 | DM pairing, allowlists | `gateway/pairing.py` | `gateway/pairing.ts`, per-platform `parse*Allowlist` | HAS cr | SKIP | - | - |
| 47 | Streaming, typing, progress bubbles | `gateway/stream_consumer*.py` | `gateway/progress-bubble.ts`, `typing-heartbeat.ts`, `stream-events.ts` | HAS cr | SKIP | - | - |
| 48 | Delivery ledger / obligation | `gateway/delivery_ledger.py` | `gateway/channel-proof.ts` (round-trip proof only); GATEWAY-DELIVERY-OBLIGATION-LEDGER parked | PARTIAL cr | LATER | Needed before unattended outbound at scale | M |
| 49 | Deliverable mode (files as native attachments) | `deliverable-mode.md` | `gateway/deliverables.ts`, `deliverable-send.ts` | HAS cr | SKIP | - | - |
| 50 | Untrusted-payload toolset for webhooks | `toolsets.py` `_HERMES_WEBHOOK_SAFE_TOOLS` (4 tools) | `gateway/webhook.ts` has no toolset restriction I could find; TRUST-05 open | PARTIAL cr | LATER | Fold into TRUST-05 quarantine contract | M |
| 51 | Group sessions per participant | config `group_sessions_per_user` | not checked; single owner with allowlists | N/A | SKIP | Matters only if non-owners can talk to the bot | - |
| 52 | Hosted rooms, relay, multiplexing gateway, Bot Mode, Hermes Cloud | `gateway/hosted_room*.py`, `relay/`, `bot-mode.md` | none | N/A | SKIP | Dropped: multi-gateway/fleet topology; accounts | - |
| 53 | ACP editor server | `acp_adapter/` | `acp/` | HAS cr | SKIP | - | - |
| 54 | MCP client: OAuth, resources, elicitation | `tools/mcp_tool*.py`, `mcp_oauth*.py` | `mcp/` (`auth-flow.ts`, `elicitation.ts`, `resource-msg.ts`, `server-approval.ts`) | HAS cr | SKIP | MCP sampling: not found; no demand | - |
| 55 | MCP server mode | `mcp_serve.py` | `mcp/server.ts` | HAS cr | SKIP | - | - |
| 56 | **OSV malware check for npx/uvx MCP** | `tools/osv_check.py` | not found | MISSING cr | NOW | Rec #1 | S |
| 57 | A2A | `plugins/platforms/a2a` | `a2a/` | HAS cr | SKIP | - | - |
| 58 | TUI (Ink) | `ui-tui/` | `tui/`, `ui/` (Ink 7) | HAS cr | SKIP | - | - |
| 59 | Desktop app (panes, settings, terminal) | `apps/desktop` | `desktop-next/` (imported copy), gaps tracked in `desktop-next/docs/CUTOVER-PARITY.md`, `docs/server-gaps-2026-10-14.md` | PARTIAL doc | SKIP | Tracked elsewhere; not a Hermes-parity question | - |
| 60 | Agentic onboarding, setup beats, free-tier trial, profile build | `apps/desktop/src/store/onboarding-run.ts`, commits `4920f87b3f`... | none | N/A | SKIP | Dropped: two-profile onboarding; Nous accounts/billing | - |
| 61 | Skins, pets, achievements, themes marketplace, radio | `skins.md`, `pets.md`, `plugins/hermes-achievements` | none | N/A | SKIP | Dropped as gimmicks | - |
| 62 | Plugin catalog and marketplace | `plugin-catalog/`, `plugin_loader.py` | `plugins/marketplace.ts`, `catalog.ts`, `loader.ts` | HAS cr | SKIP | Hello-runtime samples dropped | - |
| 63 | Hooks / middleware / observer hooks | `hooks.md`, `middleware.md` | `hooks/` (24 modules: shell, http, mcp, prompt, agent hooks) | HAS cr | SKIP | - | - |
| 64 | Voice mode, wake word, STT/TTS | `tools/voice_mode.py`, `wake_word.py` | `voice/` (ptt, wake-service, whisper-stt), `tts/registry.ts` (edge, openai, elevenlabs, local) | HAS cr | SKIP | Hermes lists ~10 TTS providers; Discord voice channels: not found. Not needed | - |
| 65 | **Image generation** | `tools/image_generation_tool.py`, `plugins/image_gen/*` | not found (`media_studio` renders ffmpeg video from colour/image scenes) | MISSING cr | LATER | Inside the capability floor ("media"); paid API, so budget-gated one-way-door approval; wait for a real task that needs it | M |
| 66 | Video generation | `tools/video_generation_tool.py` | not found | MISSING cr | SKIP | Niche, expensive | - |
| 67 | Vision / image analysis | `vision_tools.py` | `tools/describe-image.ts`, `look-at-screen`, `vision-watch`, `compare-vision`, `routing/vision.ts` | HAS cr | SKIP | - | - |
| 68 | Browser automation | `browser_tool*.py`, CDP, Browserbase, camofox | `browser/` (playwright-core, persistent isolated profile), `browser_act/navigate/extract/read` | DIFF cr | SKIP | Cloud browser backends skipped; BROWSER-WORKFLOW-ACTION-BOUNDARY is next | - |
| 69 | Real-browser-profile snapshot | `tools/browser_tool_real_profile.py` | `browser/profile.ts:9-30` isolated profile, `vanta browser auth <site>` | DIFF cr | SKIP | Cookie-exfil surface; agree with adoption matrix row 8 and the 08-29 audit | - |
| 70 | Credential vault for browser logins (model never sees password) | `tools/browser_vault_tool.py`, `agent/vault_store.py` | `secrets/vault-manager.ts` (bitwarden, 1password, keychain refs); manual login into isolated profile | PARTIAL cr | LATER | BROWSER-AUTHENTICATED-WORKSPACE horizon; needs TRUST-03 | L |
| 71 | Computer use | `tools/computer_use` (cua) | `tools/vision-action.ts`, `mcp/chicago-client.ts` | HAS cr | SKIP | COMPUTER-USE-NO-FOREGROUND parked | - |
| 72 | Terminal backends (local, docker, ssh, singularity, modal, daytona, vercel) | `tools/environments/*` | `exec/adapters/` local, docker, serverless (modal/daytona py shims); `ssh/config.ts` only, no ssh exec adapter | PARTIAL cr | LATER | DECISIONS 2026-06-19 promoted SSH; singularity/vercel SKIP | M |
| 73 | Kanban board, dispatcher, worker lanes | `kanban.md`, `kanban-worker-lanes.md` | `kanban/`, `tickets/`, `cofounder/`, company engine, `worker-runtimes/` | HAS cr | SKIP | Vanta adds USD budgets, approvals, work-product review | - |
| 74 | Batch runner and trajectories | `batch_runner.py`, `trajectory_compressor.py` | `batch/batch.ts`, `training/trajectory.ts`, `export.ts` | HAS cr | SKIP | Training-data focus is not Vanta's | - |
| 75 | Evals suite | `evals/*` (~70) | `eval/`, `bench/`, `skill-eval/`, `mem-eval/`, `usecase-eval/` | HAS cr | SKIP | - | - |
| 76 | Smart approvals (aux LLM can auto-APPROVE) | `tools/approval_smart.py`, `approvals.mode: smart` | `permissions/auto-classifier.ts:1-7` tighten-only (allow to ask/block, never loosens) | DIFF cr | SKIP | Auto-approve by model contradicts kernel model | - |
| 77 | YOLO / `approvals.mode: off` | `approval_yolo.py`, `/yolo` | Access mode `full` with versioned per-project acknowledgement (V-019); kernel still gates | DIFF cr | SKIP | Hermes keeps a hardline floor even in YOLO; Vanta keeps the kernel | - |
| 78 | Hardline blocklist floor | `security.md` | kernel `src/safety.rs:35-47`, tests `safety_tests.rs` | HAS cr | SKIP | SECURITY.md section 6: `assess()` is a denylist; sandbox is the boundary | - |
| 79 | URL safety, website policy | `tools/url_safety.py`, `website_policy.py` | `net/ssrf-guard.ts`, `net/egress-policy.ts`, `net/ip-ranges.ts` | HAS cr | SKIP | - | - |
| 80 | Secret redaction, child env scrub | `agent/redact.py`, `env_passthrough.py` | `redactSecrets`, `exec/child-env.ts` `buildSafeChildEnv` | HAS cr | SKIP | - | - |
| 81 | Secret source plugins | `docs/secrets/*` | `secrets/provider.ts` (bw, 1password, keychain) | HAS cr | SKIP | - | - |
| 82 | Git probe execution isolation | commit `f6234d0` | `git/policy.ts:6-21,59`, `git/process.ts`, `git/hostile-fixture.ts` | HAS cr | SKIP | Roadmap card still says next: stale (section 8) | - |
| 83 | Egress isolation (iron-proxy, network isolation) | `docs/egress/*` | `net/egress-policy.ts`, `mcp/egress-warn.ts`, docker backend | PARTIAL cr | SKIP | SANDBOX-EGRESS-CREDENTIAL-BROKER parked | - |
| 84 | Write guards / self-repo guard | `file_safety.py`, `write_approval.py`, `self_repo_guard.py` | `tools/writable-zones.ts`, `zones.ts`, kernel `src/scope.rs`; CONTROL-PLANE-INSTRUCTION-WRITE-BOUNDARY next | HAS cr | SKIP | - | - |
| 85 | Managed scope / org policy | `managed-scope.md` | none | N/A | SKIP | Single owner (DECISIONS 2026-06-19) | - |
| 86 | Telemetry, trace upload, Nous Portal, Tool Gateway, billing | `agent/trace_upload.py`, `tool-gateway.md` | removed by design | N/A | SKIP | Branding, accounts, billing, telemetry removed | - |
| 87 | Profiles and distributions | `profiles.md`, `profile-distributions.md` | `profiles/store.ts`, `distribution.ts`, `desktop/profiles-view.ts` | HAS cr | SKIP | - | - |
| 88 | Usage / insights / billing view | `agent/insights.py`, `account_usage.py` | `cost/ledger.ts`, `route-ledger.ts`, `repl/dashboard-cmd.ts` | HAS cr | SKIP | Needs a purpose field (rec #2) | - |
| 89 | SOUL.md / personality / context files | `personality.md`, `context-files.md` | root `SOUL.md`, AGENTS/CLAUDE loading | HAS cr | SKIP | - | - |
| 90 | Language packs / i18n | `language-packs.md`, `locales/` | not checked | N/A | SKIP | No users asking | - |
| 91 | Import from other agents | `hermes claw migrate`, `import-agent` | `migrate/` (sources openclaw, hermes) | HAS cr | SKIP | Skills only; see row 94 for the MCP/model gap | - |
| 92 | Update, doctor | `hermes update`, `doctor` | `update/`, `diagnose/`, `health/` | HAS doc | SKIP | Not checked | - |
| 93 | Insights on tool-schema health, catalog health | `mcp_tool_health.py`, `mcp_liveness.py` | `mcp/wait-ready.ts`, `mcp/events.ts` | PARTIAL cr | SKIP | Wait for a real flaky server | - |
| 94 | **Import Hermes config (`config.yaml`, `mcp_servers`)** | `docs/user-guide/features/mcp.md:36` (`mcp_servers:` in config.yaml) | `migrate/parse.ts:22-25` probes `mcp.json config.json hermes.json settings.json` only; no yaml handling anywhere in `migrate/` | PARTIAL cr | NOW | `vanta migrate hermes` on a real Hermes home would import skills but not MCP servers or model. Owner has `~/.hermes/config.yaml`. Adds a YAML parser (dep flag: none in package.json today) or a 30-line block reader | S |

## 4. New in Hermes since `6e7b83a2f1` that matters to Vanta

Window: 387 commits, 2026-10-13 to 2026-10-14 (about 250 commits/day upstream, so "recent" is days).

| Change | Evidence | Matters to Vanta? | Action |
|---|---|---|---|
| Agentic onboarding rework: `/initiate-setup` and `setup_choose`/`start_chat` tools retired, `setup_beat` tool, first-task catalog, free-tier trial, intro replay | commits `ba6cf55b22`, `25bf722063`, `b120ac575d`, `4920f87b3f`, `8cf3377191` (~200 of 387) | No. Dropped (two-profile onboarding, accounts). | Do not merge. |
| Desktop gateway contract delta | `apps/shared/src/gateway-contract.openrpc.json`: 259 to 257 methods. Added `machine.facts`, `onboarding.set_run/skip/start`. Removed `onboarding.ensure_setup_profile/ensure_setup_session/mark_seen/record_failed_start/reset_setup_profile`, `session.start_chat` (diffed with python, **x** on the JSON, not on an app) | Only if `desktop-next` is ever re-synced from upstream: `desktop-next/apps/desktop/src/store/onboarding-gate.ts`, `start-chat.ts`, `app/contrib/onboarding-kickoff.ts` still reference the old methods | Treat the 6e7b83a2f1 copy as frozen. No cherry-pick is needed; the rest of the 138 desktop commits are onboarding polish, plugin-install modal rewrite, per-base accent copies, Hermes Cloud "Screen" wording. |
| Plugin install modal rewrite | `plugin-install-modal.tsx` (884 lines changed), `plugin-install-run.ts` | Only if the plugin install page is kept | Skip for now |
| Gemini 4 "Argon" long-decode: resume a dropped stream from its last checkpoint, hop ceiling | `121aee41b6`, `e6370f4004`, `7e85c68a0d` | Provider-specific; Vanta has a Gemini id | LATER, only if Gemini streams drop in practice |
| Tool-schema `$ref` fixes (arrays, percent escapes, bounded recursion) | `8f2c147c57`, `8f81791172`, `8636ccc4c5` | Yes in principle: Vanta has no `$ref` handling (row 17) | LATER (S) |
| Escape-drift correction shared by edit tools, quote-escape rejection | `74bec4c243`, `3a3d1281eb`, `bc26e5caa9` | Maybe: edit reliability (row 3) | Measure first |
| Search runs the pinned ripgrep, not first `rg` on PATH | `9b4710b829` | Low. `tools/grep-files.ts:101` execs `rg` from PATH with an argv array (no shell), so no injection; only a version-skew risk | Skip |
| Connector file inputs/outputs; Hermes Cloud connectors | `e1b18e2bca`, `5f7473446b`, `2d6a0e6f32` | No (Nous-hosted service) | Skip |
| CDN-block error message, release lanes, Windows MSIX/PM fixes, `uv` cache | `5ac6af436d`, `36a8ee18cd`, `8ef7654bf5` | No | Skip |
| Local Models on by default | `1e8bf3ee46` | Vanta already ships runtime controller | None |
| Security fixes since the import | I found none by subject (grep of security/ssrf/injection/redact terms over the window returned only the `$ref` and escape-drift items above) | - | **Subject-grep only; a diff read could find more.** |

Earlier Hermes security items Vanta should mirror (older than the import, so not "new", but they are the evidence behind recs): OSV malware preflight (`tools/osv_check.py`, with the persisted cache added after incident #75485), trust-tiered skills guard (`tools/skills_guard.py`, scanner `skills-guard-v10`), webhook sessions limited to four tools (`toolsets.py`).

## 5. Things Vanta has that Hermes lacks (do not trade away)

| Vanta capability | Evidence | Hermes comparison |
|---|---|---|
| Rust kernel gating every tool call, independent of the model; spawn-depth ceiling in the kernel | `src/safety.rs`, `src/approvals.rs`, `subagent/spawn-guard.ts` | Hermes approval is Python in-process; "smart" mode lets a model approve (`approval_smart.py`) |
| Tighten-only advisory classifier | `permissions/auto-classifier.ts:1-7` | Hermes's aux LLM can auto-approve |
| Project-scoped Always rules, one-way-door actions never offer Always, exact-action approval card | `desktop-next/docs/CUTOVER-PARITY.md` V-018..V-020; `docs/approval-persistence-2026-10-13.md` | Hermes approvals are session/global modes (`approvals.mode`) |
| Unattended runs deny approvals by default; CLI workers marked self-approving get a warning and no Always | `schedule/AGENTS.md`; `docs/worker-runtimes-2026-10-13.md` | Hermes `cron_mode: approve` auto-approves everything headless |
| Company engine: workers, tickets, USD budgets (reported / estimated / not-reported basis), approvals, OKRs, review gates; external CLIs as workers | `worker-runtimes/`, `cofounder/`, `cost/route-ledger.ts` | Hermes kanban has iteration budgets only (docs `kanban.md` L16-24); I read docs, not source |
| Per-call route ledger with billing mode and fallback depth | `cost/route-ledger.ts:10-30` | Hermes has `usage_pricing`, `billing_*`; not compared field by field |
| Verified-completion lifecycle (WorkItem states, receipts, model prose cannot verify) | STRATEGY.md "Trust contract"; `verify/completion-verifier.ts` | Hermes has `verification_stop.py`; no equivalent lifecycle found by file names |
| Executive-function layer (continuity, capacity, snooze/skip/off, re-entry) | `continuity/`, `nd/`, STRATEGY.md | No equivalent found in Hermes file names (`git ls-tree` grep for continuity/executive/neurodiv) |
| Git execution-sink hardening with a hostile-repo fixture | `git/policy.ts`, `git/hostile-fixture.ts` | Hermes fixed the class in `f6234d0`; Vanta also has a fixture |
| Eval-gated self-learning (propose, gate, adopt, measure) | `learning/loop.ts` | Hermes review fork has no equivalent gate I saw |
| Telephony, payments, Shopify, finance, marketing, outreach, media tools under transaction gates | `tools/telephony-workflow.ts`, `payment-transaction.ts`, `shopify-operations.ts` | Hermes ships some as optional skills (`optional-skills/payments`); not compared |
| Prompt text passed on stdin to worker CLIs (not argv) | `docs/worker-runtimes-2026-10-13.md` Security model | n/a |

## 6. Auxiliary models and Mixture of Agents: should Vanta have them?

### 6a. Auxiliary models: **PARITY-NOW, but only the narrow slice (rec #2)**

Evidence
- Correction to the brief: Vanta does have cheap-model routing. `routing/aux-map.ts` defines `VANTA_MODEL_{VISION,SUMMARIZE,TITLE,EMBED,CLASSIFY,PRUNE,CODE}` plus `VANTA_*_PROVIDER` (cr). It is live for: summarizer (`session.ts:127-136`), vision tools (`routing/vision.ts` used by `vision-watch`, `vision-action`, `look-at-camera`), `web_fetch` extract (`routing/extract.ts`, `tools/web-fetch.ts:114`), TTS (`routing/tts.ts`), session-start tier routing (`session/capability-setup.ts:18`), plugin LLM (`plugins/loader.ts:197`). `AUTO-MODEL-MAP` / `WEB-EXTRACT-AUX-MODEL` cards are shipped.
- The gap is the background forks. `session/background-learning.ts` passes `opts.provider` (the main session provider) to the review fork (`:55,68`), session memory, memory extractor, dialectic, brain learn, critic and completion verifier (`:101,133,159,199,220`). `sessions/auto-title.ts` (`generateSessionTitle`) has no caller outside its test (rg, cr): dead code.
- Config is env-only (no settings file, no picker); the ledger has no purpose field (`cost/route-ledger.ts:10-30`), so the share of spend from forks is unknown.
- Hermes: per-task `auxiliary.<task>` blocks (provider, model, base_url, reasoning_effort, timeout, fallback_chain), picker in `hermes model`, and plugin-registered tasks (`agent/auxiliary_task_config.py`). Default is `auto` = main model for every task (`configuration.md`, "Auxiliary Models"), so Hermes only saves money after the owner configures it. Hermes ships ~12 task slots (vision, title_generation, compression, curator, background_review, approval, kanban_decomposer, profile_describer, session_search, tts_audio_tags, voice_chat, moa_reference).

Verdict reasoning: it is cheap (the ladder exists), reversible, and kernel-neutral (a cheaper model for a fork does not change tool gating; skill and memory writes still go through `skills/write-approval.ts` and its injection scan). Do not copy Hermes's `approval` aux task (model-approved commands): SKIP.

Minimal design (matches rec #2)
1. Add `purpose` to the route-ledger schema; set it at each call site (`main`, `learn`, `verify`, `summarize`, `vision`, `extract`).
2. Add `AuxFunction` members `learn` (review, extractor, session memory, dialectic, brain learn) and `verify` (critic, completion verifier) in `routing/aux-map.ts`; one helper `auxOr(fn, provider)` mirroring `session.ts:133-137`; replace `opts.provider` at the seven call sites. Unset env = byte-identical.
3. Read the ledger for a week of real use, then set the env for the forks that spend the most; run `mem-eval`/`skill-eval` before keeping any.
4. Not now: a settings-file/picker UI (the desktop `auxiliary.*` page is already hidden as unserved, `docs/server-gaps-2026-10-14.md` section 3); delete or wire `auto-title.ts` (separate call).

### 6b. Mixture of Agents: **PARITY-LATER, not now**

Evidence for
- Hermes reports a two-model preset beating either model alone: HermesBench 0.8202 vs 0.7607 (best single) and 0.7412 (`mixture-of-agents.md`, "Benchmarks"). Their bench, their config, not reproduced.
- Cost model is reasonable: references have no tools and run once per user turn; the aggregator is the acting model and gets their output as a trailing user message, so the prompt cache prefix survives.

Evidence against doing it now
- Hermes itself walked back its default: before July 2026 references re-ran every tool iteration; the default is now once per user turn "until per-mode benchmarks justify a costlier default" (same doc, "Default change"). Their own evidence for the costlier mode is not strong enough.
- It is a large feature upstream: `agent/moa_loop.py` is 1550 lines, `moa_alternation.py`, `moa_trace.py`, a privacy filter, per-slot reasoning effort, fallback integration, ~120 MoA-related commits since 2026-09-01 (git log grep). That is a maintenance signal.
- Vanta's `council` does not give model diversity: every role runs `resolveProvider(process.env)` (`tools/council.ts:38-45`), so it is one model in four costumes. `agent/advisor.ts` already provides a stronger-model read-only second opinion after repeated tool failures.
- It sends the conversation to additional providers (data egress the owner has to opt into per provider) and multiplies spend, in a product whose proof bar is "executed evidence at the level claimed" (STRATEGY "Product proof"). Vanta has no result showing it helps on its own task set.
- Not in the capability floor the owner named; no user has asked.

Trigger to promote to NOW: Vanta's own eval harness (`eval/`, `bench/`) shows a MoA preset beating the best single model on the representative generalist task set (STRATEGY "Product proof") at a cost the owner accepts.

Minimal design if promoted (M: best 1d / realistic 2-3d / worst 1 week)
- A virtual provider `moa:<preset>` implementing `LLMProvider` (`providers/interface.ts`), wrapping like `providers/fallback.ts` does. No kernel change: reference calls pass `tools=[]`.
- References get only user/assistant text (no system prompt, no tool transcript), pass through `redactSecrets` first, run once per user turn in parallel, a failed reference is recorded and skipped.
- Their outputs go to the aggregator as one trailing user message labelled private guidance; the aggregator is the normal acting provider through the normal loop and gets normal kernel gating.
- Every reference call is written to `route-usage-ledger.jsonl` with `purpose=moa_reference` and counted against the budget gate; off by default; preset stored in settings (provider+model pairs), not env.
- Cheaper stepping stone available today (S): let `council` take a model per role (env list), which tests model diversity with existing code before building a provider.

## 7. Where I agree / disagree with `docs/upstream-adoption-matrix-2026-10-13.md`

That matrix is a first pass focused on Desktop approval UX across five upstreams; this review is Hermes-wide. Its statuses are code-path, mine too.

| Matrix row | My position |
|---|---|
| 1 (grant lifecycle visible/revocable), 2 (argv-prefix scoped shell grants + banned interpreter prefixes), 3 (model catalog freshness), 5 (steer-at-submit) | Not Hermes parity items, not re-verified. On safety merit rows 1-2 should still outrank my recs #2-#3; rec #1 is comparable (supply chain) |
| 4 unified deadline | Agree, MISSING (row 14 here) |
| 6 tool search | Agree, quality unmeasured |
| 7 delegated child cost/time | **Disagree in part.** "No depth cap" is wrong: the kernel refuses runaway spawn depth (`subagent/spawn-guard.ts:7-27`, fallback max 6). Per-child cost/time cap is still not found |
| 8 browser real profile | Agree: reject snapshot copy |
| 9 attention budget, 10 denial breaker | Agree (rows 15 here) |
| "Not inspected": memory/recovery, cron, Hermes gateway delivery, voice | I covered these at doc level only (rows 28-48, 64); no new code verdicts |

## 8. Notes on Vanta itself (security and honesty)

Plain statements, all **cr**, none exploited or run.
1. **Old desktop starts the LAN companion by default, bound to all interfaces.** `vanta-ts/desktop-app/electron/main.mjs:34` (`companion = !args.includes("--no-companion")`) and `src/desktop/server.ts:165` (`host = companion ? "0.0.0.0" : "127.0.0.1"`). Access is gated by pairing code and hashed bearer per `desktop-next/docs/CUTOVER-PARITY.md` V-038 (**doc**, I did not read `companion/auth.ts` end to end). `desktop-next` makes it opt-in; keep that, and do not carry the default-on behaviour across at cutover. Severity: medium-low; it is authenticated exposure, not an open port.
2. **No known-malware check on MCP packages** launched with `npx`/`uvx` (rec #1). Approval is bound to the command hash, which stops a swap, not a bad package.
3. **Skill install scan is prompt-injection-only** (`skills/gating.ts:62-80`): no exfiltration/persistence/destructive-command categories and no source-trust tiers (row 37).
4. **Hermes workers see their prompt in `ps`** (`hermes -z <prompt>`; redacted, documented in `docs/worker-runtimes-2026-10-13.md`). Known, accepted.
5. **`kernel assess()` is a denylist; the sandbox is the boundary** (`SECURITY.md` section 6, known and documented). Relevant when weighing any Hermes feature that assumes command classification is enough.
6. **Roadmap lag**: `REPOSITORY-GIT-PROBE-EXECUTION-ISOLATION` is `next` in `roadmap.json` but `git/policy.ts`, `git/process.ts` and a hostile-repo fixture exist. Either the card is done and unrecorded or the code is not wired everywhere; I checked only that no `execFile("git")` exists outside `git/` and one test fixture.
7. **Stale memory**: "~13 channel adapters, 5 live" is out of date. `gateway/platforms/registry.ts` has 22 catalog entries each with an adapter; live status is unverified.
8. `sessions/auto-title.ts` is dead code (no non-test caller).

## 9. Row counts

94 matrix rows (computed from the table with awk):

| Verdict | Rows |
|---|---|
| PARITY-NOW | 4 (rows 21, 30, 56, 94) |
| PARITY-LATER | 15 |
| SKIP | 75 |

| Status | Rows |
|---|---|
| HAS | 52 |
| PARTIAL | 17 |
| MISSING | 9 |
| DIFF (different by design) | 9 |
| N/A | 7 |

Skills applied: source-grounded, si-calibration-gate, si-outside-view, vd-report-the-gap (basis tags and the not-checked list above).
