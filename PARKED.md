# PARKED — Vanta

Deferred ideas. Promote, never delete. These are honest deferrals — the code that exists is real and tested; these are the bits that need external setup or are post-MVP polish.

## Promoted into v1 (2026-06-02 — now in `ROADMAP.md`, no longer parked)
- **Claude subscription OAuth** → ROADMAP **G1** (was "Scope-limited v0" below).
- **`vanta cron` OS trigger** → subsumed by ROADMAP **E1** (daemon/service mode runs an in-process cron tick; launchd backend).
- **A2A networked transport** → ROADMAP **E6** (ACP server — ACP is the real interop path).
- Plus net-new v1 scope: Gemini/OpenRouter providers + provider registry + `vanta setup` wizard + `status`/`doctor` (A), the self-improvement loop wiring (B), session persist/resume (C), skill-library port (D), messaging gateway (E2). See `ROADMAP.md`.

## Newly parked — out of v1 scope
- **The ~24 niche model providers** beyond OpenAI/Anthropic/Ollama/Gemini/OpenRouter (Bedrock, DeepSeek, xAI, Qwen, Kimi, Z.AI, Copilot, MiniMax, Nous, …). The provider *registry* (A2) makes each a small add later; not v1 work.
- **The other ~19 messaging platforms** beyond Telegram (Discord, Slack, Signal, WhatsApp, Matrix, iMessage, the China stack, …). v1 ships Telegram only to prove the `BaseAdapter` pattern (Rule of 3).
- **Image-gen / voice-transcription providers** (DALL-E/Whisper registries) — not on the operator path.
- **Multi-credential failover pool** (`credential_pool.py` — round-robin/least-used across many keys). Single-user, single-key; no need.
- **Trajectory / datagen pipeline** (`batch_runner` → ShareGPT JSONL → fine-tuning). It's a *training-data* pipeline, not the runtime self-improvement loop; only relevant if Vanta ever fine-tunes a model.

## Live-use setup (code is built + offline-tested; these unlock live use)
- **Comms OAuth client** — `vanta auth google` needs a one-time Google Cloud OAuth client (`VANTA_GOOGLE_CLIENT_ID/SECRET`). Truly zero-config "bundled client" needs Vanta registered as a published OAuth app (publisher step). Captured 2026-06-02. Cost to revisit: ~30 min in Google Cloud Console + set 2 env vars.
- **Browser binaries** — browser tools need `npx playwright install chromium` (playwright-core ships no binaries). Tools degrade gracefully with a clear message until then.
- **API keys** — Anthropic provider (`ANTHROPIC_API_KEY`) and `describe_image` vision (`OPENAI_API_KEY`) need keys for live use.

## Hardening / fidelity
- **OAuth PKCE** — `google/auth.ts` uses the confidential-client loopback flow (client secret). PKCE (S256) is ~4 lines of additional hardening. Captured 2026-06-02.
- **Anthropic adjacent tool_result merge** — `toAnthropicMessages` emits consecutive tool results one-per-message; the API enforces role alternation, so merging adjacent `tool_result` blocks may be needed for multi-tool turns. Flagged by the builder.
- **vitest 4 upgrade** — devDependency esbuild advisory (dev-server only, never shipped). `npm audit fix --force` → vitest 4 (breaking). Pre-existing from Phase 1.

## Scope-limited v0 implementations (real, bounded)
- **LSP = .ts/.tsx only** — `lsp_diagnostics`/`lsp_definition` use the TS compiler API. Other languages (rust-analyzer, pyright) are future.
- **A2A = local in-process** — `A2ABus` routes between in-process agents. Networked interop = ACP server (promoted → ROADMAP E6).
- **Non-streaming providers** — the loop waits for full tool calls; streaming fits behind `LLMProvider` later (locked decision, Phase 1).

## Polish (post-users)
- Streaming live output, richer cockpit UI, multi-language run-code sandboxing, project-room goal namespacing beyond per-dir `.vanta`.

## Claude Code parity — deliberately excluded (2026-06-07)
Audited Claude Code's full feature set (~250 features) for the roadmap; 19 in-scope gaps → `roadmap.json` track "Claude Code parity". These ~45 are **out of scope** for a local, provider-agnostic, kernel-gated operator and were NOT carded — Anthropic-proprietary/cloud/account features: `/passes` `/stickers` `/radio` `/upgrade` `/login` `/logout` `/privacy-settings`, claude.ai teleport / remote-control / `/remote-env` / cloud VMs (`--remote`), Desktop/mobile/Chrome/web surfaces, Bedrock/Vertex setup wizards, GitHub-App / Slack-App installers, cloud reviews (`/ultrareview` `/ultraplan` `/autofix-pr`), `/powerup` `/team-onboarding` `/heapdump` `/release-notes` `/usage-credits` `/color` `/scroll-speed`, managed-agents-onboard. Cost to revisit: re-audit a single feature if Vanta ever grows that surface (e.g. a real desktop app → reopen the IDE/desktop class). (The bundled coding skills `/review` `/simplify` `/verify` `/run` are NOT parked — tracked as `VANTA-CODING-SKILLS` in `roadmap.json`.)

## Roadmap re-org parks (2026-06-11, STRATEGY.md filter)
166 open cards parked at the 5-pillar re-track (DECISIONS 2026-06-11): Anthropic cloud/account/enterprise coupling, IDE surfaces, their telemetry, duplicates/folds, post-users polish. Full card bodies recoverable from git history (roadmap.json @ 02959a1). Cost to revisit: re-add via `roadmap_add` or restore from git.

- `VANTA-ABLATION` Ablation baseline mode — single env var disables all advanced features for A/B testing — their internal A/B baseline
- `VANTA-ADMIN-REQUEST` Admin request flow — limit increase / seat upgrade for team users — seat/limit upgrade flows
- `VANTA-ANSI-PNG` ANSI-to-PNG renderer — terminal screenshot as PNG with bitmap font — folds into VANTA-SCREENSHOT-CLIPBOARD
- `VANTA-ANTI-DISTILL` Anti-distillation beta header — prevent model distillation from CC sessions — their API beta header
- `VANTA-APPLE-TERMINAL-BACKUP` Apple Terminal backup/restore — recover from interrupted sessions — terminal-specific recovery; sessions/resume exist
- `VANTA-AUTO-MODE-GA` Auto mode GA — no opt-in required, available for Max/Opus 4.7+ — their plan gating of auto mode
- `VANTA-AUTOUPDATE` Auto-updates channel + version enforcement settings — folds into VANTA-AUTO-UPDATER
- `VANTA-AUTOUPDATE-UI` In-TUI auto-updater — update notification + one-click upgrade — folds into VANTA-AUTO-UPDATER
- `VANTA-AWAY-RECAP` Away summary — recap on return to an idle session — duplicate of VANTA-AWAY-SUMMARY
- `VANTA-AWS-BEDROCK-PROVIDER` AWS Bedrock provider — full Bedrock deployment with inference profiles, STS, cross-region — DECISIONS 2026-06-09: curated 8 providers; Bedrock = post-v1
- `VANTA-BACKGROUND-REMOTE-SESSION` Background remote sessions — spawn CCR sessions in background with precondition checks — CCR background sessions
- `VANTA-BASH-PARSER-TS` Pure-TypeScript bash parser — tree-sitter-compatible AST for permission analysis — alternative to VANTA-TREE-SITTER-BASH (keep one parser)
- `VANTA-BEDROCK-WIZARD` Bedrock interactive setup wizard — guided AWS credentials and region config — DECISIONS 2026-06-09: curated 8 providers
- `VANTA-BG-SESSION-CMDS` Background session process manager — `claude ps/logs/attach/kill` + `--bg` flag — duplicate of VANTA-BG-AGENTS
- `VANTA-BOOTSTRAP-MODEL-OPTIONS` Bootstrap API — server-side additional model options list — server-side model list from their API
- `VANTA-BRIDGE-CCR` CCR bridge — connect local TUI to remote cloud sessions with polling — bridge local TUI to their cloud sessions
- `VANTA-BRIDGE-QR` Bridge QR code — scannable QR for mobile/remote connection to live session — QR onto a remote bridge Vanta doesn't have; revisit with gateway
- `VANTA-BUDDY` Companion buddy — animated ASCII creature with species, rarity, stats — ASCII pet — post-users
- `VANTA-BUN-WEBVIEW` Bun WebView — native embedded browser panel inside the terminal — embedded browser panel — browser tools + DESKTOP cover it
- `VANTA-BYOC-SETUP` /remote-setup — BYOC container setup with GitHub OAuth token — their BYOC remote setup
- `VANTA-CCR-AUTO-CONNECT` CCR auto-connect — auto-start CCR on session launch via GrowthBook gate — GrowthBook-gated CCR autostart
- `VANTA-CCR-MIRROR` CCR mirror mode — outbound-only session mirroring to claude.ai — mirror to claude.ai
- `VANTA-CCR-REMOTE-SETUP` Remote setup wizard — `web` command for guided CCR onboarding — CCR onboarding wizard
- `VANTA-CEDAR-SYNTAX` Cedar policy syntax highlighting — `.cedar` and `.cedarpolicy` files — AWS Cedar highlighting — niche
- `VANTA-CHROME-EXTENSION-PROMPTS` Prompts from Claude for Chrome — browser extension sends prompts to terminal — Claude-for-Chrome coupling
- `VANTA-CHROME-NATIVE-SETUP` Claude in Chrome setup — install native messaging host for all Chromium browsers — their Chrome native host
- `VANTA-CLAUDE-API-SKILL` Claude API skill — built-in skill for building Claude API applications — their API docs content skill
- `VANTA-CLI-HIGHLIGHT` Syntax highlighting — colored code blocks in CLI output via cli-highlight — duplicate of VANTA-HIGHLIGHTED-CODE
- `VANTA-CLIENT-ATTEST` Native client attestation — cch= token in User-Agent for first-party auth — their first-party auth attestation
- `VANTA-CLOUD-CREDS` Cloud credential refresh scripts — AWS, GCP, API key helper, OTel — AWS/GCP cred refresh — enterprise
- `VANTA-CODE-REVIEW-CMD` `/code-review` — renamed from `/simplify`; runs correctness review at chosen effort — their command-rename trivia
- `VANTA-COLOR-PROMPT` /color — set prompt bar accent color for current session — /color was in the 2026-06-07 excluded list
- `VANTA-COLOR-RANDOM` `/color` with no args — picks a random session color — /color trivia
- `VANTA-CONNECTOR-TEXT` Connector text blocks — render summarize-connector-text beta with streaming awareness — their beta block type
- `VANTA-COWORK-MODE` Cowork mode — separate plugin directory for teammate/collaborative sessions — their collaborative product (XL)
- `VANTA-COWORKER-TYPE` Coworker type analytics — CLAUDE_CODE_COWORKER_TYPE env logged to session metadata — their analytics env
- `VANTA-DESKTOP-HANDOFF` `/desktop` — download and launch the Claude desktop app from terminal — downloads their desktop app; Vanta DESKTOP track exists
- `VANTA-DESKTOP-UPSELL` Desktop app upsell dialog — GrowthBook-gated prompt to try Claude Code Desktop — GrowthBook upsell dialog
- `VANTA-DIRECT-CONNECT-SERVER` Direct-connect server — CC as local HTTP+WebSocket server for IDE/client connections — duplicate of DESKTOP-P3 architecture
- `VANTA-DISABLE-UPDATES-ENV` `DISABLE_UPDATES` — completely block all update paths including manual `claude update` — folds into VANTA-AUTO-UPDATER
- `VANTA-EXTRA-USAGE-CMD` /extra-usage — configure overage provisioning to keep working past rate limits — overage provisioning — their billing
- `VANTA-FAST-MODE-IMPL` Fast mode — Opus 4.6 with rate-limit cooldown circuit breaker — their fast-mode product/rate-limit coupling; Vanta has model routing
- `VANTA-FEEDBACK-CMD` /feedback slash command — report issues or suggestions from within the session — reports to their tracker; /bug exists
- `VANTA-FEEDBACK-SURVEY-UI` Feedback survey UI — in-session survey with transcript sharing — their survey pipeline
- `VANTA-FIG-CMD-SPECS` Fig/withfig autocomplete spec loading — command argument security validation — withfig spec dependency — niche
- `VANTA-FILE-HISTORY-SNAP` File history snapshots — hardlink-based file state capture before edits — folds into VANTA-REWIND (its mechanism)
- `VANTA-FILE-PERSIST` File persistence — BYOC session file state snapshot between turns — BYOC cloud session state
- `VANTA-FILES-API` Files API integration — upload session files to Anthropic cloud storage — uploads to Anthropic cloud storage
- `VANTA-FPS-METRICS` TUI FPS metrics — render performance monitoring — TUI perf monitoring — revisit if TUI-V2 perf hurts
- `VANTA-GIT-REPO-SESSION` Git-sourced remote sessions — create remote session from a git repository URL — remote sessions in their cloud
- `VANTA-GROVE` Grove — data privacy/consent opt-in dialog at onboarding and policy updates — their telemetry consent dialog
- `VANTA-H-ACCOUNT` Account / billing / fun — their account/billing/fun
- `VANTA-H-AGENT-TEAMS` Multi-session agent teams — umbrella duplicate of VANTA-TEAMS cluster
- `VANTA-H-BROWSER-IDE` IDE extensions + browser — IDE-plugin class excluded (PARKED 2026-06-07)
- `VANTA-H-CLOUD-REVIEW` Cloud multi-agent review — Anthropic cloud review product
- `VANTA-H-CLOUD-SESSION` Cloud VM sessions — Anthropic cloud VMs
- `VANTA-H-DESKTOP-APP` Desktop/web app surfaces — duplicate of DESKTOP track
- `VANTA-H-ENTERPRISE` Enterprise backends + telemetry — their enterprise backends + telemetry
- `VANTA-H-MISC` Misc product polish — vague umbrella card
- `VANTA-H-MOBILE` Mobile app — Anthropic mobile app surface
- `VANTA-H-REMOTE-CONTROL` Remote control + teleport — claude.ai remote control/teleport
- `VANTA-H-SDK` Agent SDK / Managed Agents — their SDK/managed-agents product; PLUGIN-FRAMEWORK covers extensibility
- `VANTA-HARD-FAIL` Hard fail mode — crash on logError calls for test harness reliability — their test-harness mode
- `VANTA-HOOKS` User-configurable lifecycle hooks — duplicate of VANTA-HOOKS-ENGINE
- `VANTA-HTTPS-PROXY` HTTPS proxy support — route API calls through corporate proxy — corporate proxy — post-users
- `VANTA-IDE-AUTO-CONNECT` IDE auto-connect dialog — prompt to enable/disable automatic IDE connection — IDE integration
- `VANTA-IDE-DIFF` IDE diff integration — open file edits in IDE diff viewer — IDE integration
- `VANTA-JETBRAINS` JetBrains IDE integration — detect and connect to PyCharm, IntelliJ, WebStorm, etc. — IDE integration
- `VANTA-KAIROS` KAIROS assistant mode — claude.ai-integrated assistant with brief/proactive/channels — claude.ai-integrated assistant mode
- `VANTA-KAIROS-CHANNELS` KAIROS channels — MCP push notification channel subscriptions via --channels flag — their push channel subscriptions
- `VANTA-KAIROS-GITHUB` GitHub PR webhook subscription — subscribe-pr command + SubscribePRTool — their PR webhook product; AUTO-WATCH covers watching
- `VANTA-LOGO-ANIMATED` Animated startup — AnimatedAsterisk, feed system, channels notice — startup animation + feed — post-users
- `VANTA-MANAGED-DOMAIN-SECURITY` Managed domain security — `allowManagedDomainsOnly` enforced across all settings sources — managed-domain enforcement
- `VANTA-MANAGED-PLUGINS` Org-managed plugins — policy enforcement for required/disabled plugins — org plugin policy
- `VANTA-MANAGED-POLICY` Managed policy scope — org-wide CLAUDE.md and dynamic settings — org-managed policy — enterprise
- `VANTA-MARKETPLACE-AUTO-INSTALL` Official marketplace auto-install — startup check installs missing official plugins — duplicate of bundled-skill auto-install (shipped)
- `VANTA-MCP-AUTH-TOOL` McpAuthTool — pseudo-tool that starts OAuth flow for unauthenticated MCP servers — duplicate of VANTA-MCP-AUTH
- `VANTA-MDM-SETTINGS` MDM enterprise settings — OS-level policy enforcement (macOS/Windows/Linux) — MDM enterprise enforcement
- `VANTA-MEMORY-MONITOR` Process memory monitor — high/critical heap alerts — duplicate of VANTA-MEMORY-WARN
- `VANTA-MEMORY-SHAPE` Memory shape telemetry — track memory recall patterns for analytics — recall telemetry for their analytics
- `VANTA-MSG-RATE-LIMIT` Rich rate-limit message — upsell, /upgrade, /extra-usage, tier-aware — tier upsell messaging
- `VANTA-MTLS-CONFIG` mTLS + custom CA cert config — enterprise proxy TLS support — enterprise proxy TLS
- `VANTA-NOTEBOOK` Notebook edit tool — Jupyter cell editing — Jupyter — no demand yet
- `VANTA-OTEL-ENTRYPOINT` OTEL `app.entrypoint` metric attribute — segment metrics by session entrypoint — no observability before users
- `VANTA-OTEL-RAW-BODIES` `OTEL_LOG_RAW_API_BODIES` — emit full API request/response bodies as OTEL log events — no observability before users
- `VANTA-OTEL-RESOURCE-ATTRS` `OTEL_RESOURCE_ATTRIBUTES` as metric labels — slice usage metrics by custom dimensions — no observability before users
- `VANTA-OTEL-TRACING` Enhanced telemetry beta — OTEL session tracing via OTEL_TRACES_EXPORTER — no observability before users; events.jsonl exists
- `VANTA-OVERAGE-CREDIT-GRANT` Overage credit grant — one-click extra credits when hitting rate limit — their billing credits
- `VANTA-OVERFLOW-TEST` OverflowTestTool — synthetic tool to test context overflow handling — synthetic overflow tool — build when testing compaction
- `VANTA-PASSES-REFERRAL` /passes — view Claude usage passes and referral reward balance — their referral program
- `VANTA-PERFETTO` Perfetto tracing — Chrome Perfetto-compatible performance trace export — perf tracing — post-users
- `VANTA-PERFORCE-MODE` `CLAUDE_CODE_PERFORCE_MODE` — fail on read-only files with `p4 edit` hint — Perforce — niche VCS
- `VANTA-PKG-MANAGER-UPDATE` Package manager auto-updater — in-TUI update prompt via brew/npm/apt — folds into VANTA-AUTO-UPDATER
- `VANTA-PLUGIN-ONLY-POLICY` Plugin-only customization policy — lock skills/hooks/styles to plugins only — org customization lockdown
- `VANTA-POLICY-LIMITS` Org policy limits — admin-configurable feature restrictions via remote API — org admin remote API
- `VANTA-POWERSHELL` PowerShell tool — Windows shell execution — Windows — macOS-first for now
- `VANTA-POWERSHELL-AUTO` PowerShell auto-approve guidance — include PS guidance in yolo classifier prompt — Windows — macOS-first for now
- `VANTA-PRIVACY-SETTINGS-CMD` /privacy-settings — view and update data collection privacy preferences — their data-collection prefs; Vanta is local
- `VANTA-PROMPT-SUGGEST` --prompt-suggestions — emit predicted next prompts for IDE/shell integration — IDE/shell emit variant; VANTA-PROMPT-SUGGEST-UI keeps the in-TUI version
- `VANTA-PUSH-NOTIFY` Mobile push notifications — alert when task completes or input needed — mobile push via their Remote Control; Telegram notify exists
- `VANTA-QUICK-SEARCH` Quick search — keyboard-triggered search overlay without opening a modal — duplicate of VANTA-SEARCH-BOX
- `VANTA-REDACT-THINKING` Redact thinking beta — server-side redaction of thinking blocks — their server-side beta
- `VANTA-RELEASE-CHANNELS` Release channels — stable/beta/custom update channel selection — folds into VANTA-AUTO-UPDATER
- `VANTA-RELEASE-NOTES-CMD` /release-notes — view in-session release notes for current version — their release notes (was in 2026-06-07 excluded list)
- `VANTA-REMOTE-CALLOUT` Remote Control first-run callout — onboarding dialog for CCR setup — CCR onboarding dialog
- `VANTA-REMOTE-ENV-CMD` /remote-env — configure default remote environment for teleport sessions — teleport env config
- `VANTA-REMOTE-MANAGED-SETTINGS` Remote managed settings — enterprise org policies via API with dangerous-change security gate — enterprise org policies via API
- `VANTA-REMOTE-TRIGGER` Remote trigger tool — list/run cloud-side triggers — cloud trigger registry, requires Anthropic OAuth; local cron + webhooks exist
- `VANTA-REMOTE-VIEWER` Remote session viewer mode — observe a CCR session without interrupting — observe a CCR session
- `VANTA-SDK-IDLE-TIMEOUT` SDK idle timeout — auto-exit SDK sessions after configurable idle delay — their SDK runtime detail
- `VANTA-SED-EDIT-RENDER` Sed in-place edit rendering — show sed -i commands as file diffs — niche render nicety
- `VANTA-SEND-MESSAGE-TOOL` SendMessageTool — agent-to-agent messaging within swarms (mailbox-based) — duplicate of VANTA-SEND-MSG
- `VANTA-SESSION-TELEPORT` Session teleport + remote — cross-device session continuation flags — cross-device via their cloud
- `VANTA-SETTINGS-SYNC` Settings sync — sync user settings and memory across CC environments — settings sync via their cloud
- `VANTA-SETUP-TOKEN` vanta setup-token — long-lived OAuth token for CI/automation — long-lived OAuth token for their account system
- `VANTA-SHARE-ONBOARDING` ShareOnboardingGuide tool + /team-onboarding command — team onboarding product
- `VANTA-SHELL-COMPLETION-INSTALL` Shell completion install — add `claude` tab-completion to bash/zsh/fish rc files — already shipped (CLI-DX-PACK completion)
- `VANTA-SHOT-STATS` Shot distribution stats — track shots-per-session histogram in /stats — niche analytics histogram
- `VANTA-SKIP-VERSION` Skip update version — snooze a specific CLI update version permanently — folds into VANTA-AUTO-UPDATER
- `VANTA-SLOW-OP-LOG` Slow operation logging — detect and log slow operations with Anthropic-specific hooks — Anthropic-specific hooks
- `VANTA-SPECULATION-ENGINE` Speculative prompt pre-execution — pre-run predicted next command before user submits — pre-executes predicted commands — conflicts rule zero (approval-first)
- `VANTA-STATUS-CMD` /status — show version, model, account, API health, tool statuses — already shipped (/status in REPL)
- `VANTA-STREAMLINED-OUTPUT` Streamlined JSON output — compact stream-json transformer via env flag — duplicate of VANTA-JSON-SCHEMA/--bare output modes
- `VANTA-SWARM-IT2-SETUP` iTerm2 swarm backend — multi-pane swarm via iTerm2 Python API — iTerm2 Python API backend; VANTA-SWARM-TMUX is the one mux backend
- `VANTA-SWARM-PERM-SYNC` Swarm synchronized permissions — workers forward permission requests to leader UI — duplicate of VANTA-SWARM-PERM-ROUTING
- `VANTA-TASK-BUDGETS` Task budgets — per-task token allocation via beta header — their beta header; VANTA_MAX_ITER + VANTA-BUDGET-CAP cover budgets
- `VANTA-TEAM-MEMORY-SYNC` Team memory sync — per-repo shared memory across org members via API — org memory sync via their API
- `VANTA-TEAM-TOOLS` TeamCreate/TeamDelete tools — spawn and disband named agent teams from within a session — duplicate of VANTA-TEAMS
- `VANTA-TEAMMATE-MODE` --teammate-mode — agent team UI display mode — their teammate product UI
- `VANTA-TEST-VERSIONS` Allow test versions — install and run 99.99.x CC versions for internal testing — their internal 99.99.x builds
- `VANTA-THINKBACK` /thinkback — year-in-review animation for annual usage summary — year-in-review animation — post-users
- `VANTA-TMUX` Tmux integration for worktrees — --tmux flag — folds into VANTA-WORKTREE
- `VANTA-TORCH` /torch command — internal performance benchmarking / flame graph tool — their internal benchmarking
- `VANTA-TURN-DIFFS` Per-turn file diff history — track file changes by turn index — folds into VANTA-REWIND
- `VANTA-ULTRAPLAN` Ultraplan keyword trigger — multi-agent planning mode from prompt keyword — remote CCR planning; local multi-agent planning = VANTA-PLAN-MODE-V2
- `VANTA-ULTRAPLAN-CMD` /ultraplan — launch multi-agent CCR planning session from keyword or command — remote CCR planning command
- `VANTA-ULTRAREVIEW-CLI` `claude ultrareview` — run cloud multi-agent code review non-interactively from CI — their cloud review from CI
- `VANTA-ULTRAREVIEW-QUOTA` /code-review ultra — quota-tracked cloud deep review with overage detection — their quota-tracked cloud review
- `VANTA-UPGRADE-CMD` /upgrade — in-session subscription upgrade to Max plan — subscription upsell
- `VANTA-UPLOAD-SETTINGS` Background settings upload — sync local settings to cloud on session start — settings upload to their cloud
- `VANTA-USAGE-CMD` /usage — show claude.ai plan usage and limits — claude.ai plan usage; Vanta /usage (COST-VISIBLE) exists
- `VANTA-USAGE-UTILIZATION` Rate limit utilization display — 5hr/7day windows, per-model, extra credits — their plan rate-limit windows
- `VANTA-VERSION-POLICY` `requiredMinimumVersion` / `requiredMaximumVersion` — managed settings version enforcement — managed version enforcement
- `VANTA-VERTEX-PROVIDER` Google Vertex AI provider — full Vertex deployment with GCP auth refresh — DECISIONS 2026-06-09: curated 8 providers
- `VANTA-VERTEX-WIZARD` Vertex AI interactive setup wizard — guided GCP project and auth config — DECISIONS 2026-06-09: curated 8 providers
- `VANTA-VOICE-MODE` /voice — voice input mode toggle for hands-free use — their flag-gated /voice; VANTA-VOICE-STT + VOICE-NATURAL cover it
- `VANTA-WEB-SETUP` /web-setup — connect GitHub account and configure remote web sessions — their remote web sessions (XL)
- `VANTA-WORKSPACE-ID-ENV` `ANTHROPIC_WORKSPACE_ID` — scope minted OAuth tokens to a specific workspace — scopes their minted OAuth tokens
- `VANTA-WORKTREE-BASE-REF` `worktree.baseRef` — choose `fresh` or `head` as the worktree branch base — folds into VANTA-WORKTREE
- `VANTA-WORKTREE-BG-ISOLATION` `worktree.bgIsolation: "none"` — let background agents edit working copy directly — folds into VANTA-WORKTREE
- `VANTA-WORKTREE-EXIT-DIALOG` Worktree exit dialog — confirmation when leaving a worktree — folds into VANTA-WORKTREE
- `VANTA-WORKTREE-PATH-PARAM` `EnterWorktree` path param — switch into an existing worktree mid-session — folds into VANTA-WORKTREE
- `VANTA-WRITE-IDE-DIFF` Write tool IDE diff feedback — model notified when you edit proposed content before accepting — IDE integration
- `HP-BATCH-SWE-TRAJECTORY-DATAGEN` Batch/SWE/trajectory/datagen (RL pipeline) — RL/datagen pipeline — platform-thinking before users
- `HP-CLAW` Claw (Reference migration) — vague umbrella; duplicate of CODEBASE-MINE
- `HP-HOOKS` Hooks (shell-script, list/test/revoke) — duplicate of VANTA-HOOKS-ENGINE
- `HP-I18N` i18n (16 locales) — 16 locales — post-users (no platform-thinking before users)
- `HP-INFOGRAPHIC` Infographic (C2PA-signed assets) — C2PA-signed asset generation — niche, no pillar
- `HP-INSIGHTS-ANALYTICS` Insights / analytics — analytics surface — post-users
- `HP-NOUS-PORTAL` Nous Portal (hosted inference + Tool Gateway + subs) — hosted inference + subscriptions = SaaS — anti-strategy (local-first, no platform)
- `HP-PAIRING-CODES` Pairing codes (pairing) — device pairing — Vanta has no remote surface to pair
- `HP-PLUGIN-FRAMEWORK` Plugin framework (git install) — duplicate of PLUGIN-FRAMEWORK (rock)
- `HP-PROFILE-DESCRIBE-DISTRIBUTE` Profile describe / distribute (git share) — profile git-sharing — post-users
- `HP-SKIN-ENGINE` Skin engine (YAML themes) — YAML theme engine — cosmetic, post-users
- `HP-TIPS` Tips (startup feature discovery) — startup tips — post-users polish
- `HP-WEB-DASHBOARD` Web dashboard (FastAPI + Vite) — duplicate surface: kernel cockpit + roadmap serve + DESKTOP track

## Brain v2 self-evolving substrate (brain/v2.ts)
**Captured:** 2026-06-11 (BRAIN-COHESIVE consolidation).
**Why parked:** Speculative bootstrap scaffold (Vanta designs her own brain format — jsonl/sqlite/graph/vector). The cohesive facade + structured entries layer covers current needs; self-designed substrates are platform-thinking before evidence.
**Cost to revisit:** Low — the scaffold (`BrainV2Spec`, `evolveSpec`) stays in-tree; wiring it = implementing a spec + injecting its digest through the existing facade.

## REFLECT-CORRECT — cross-session correction persistence (2026-06-14)

**Captured:** 2026-06-14.
**Core insight:** In-session adaptation already works — Vanta adjusts tone, corrects mistakes, and follows feedback within a conversation via context. What doesn't work: that correction evaporating when the session ends. Same mistake next session.

**The gap:** The background review (B3/B4) watches for reusable patterns in tool use and writes skills. It does NOT detect when a user corrects the agent mid-conversation ("no, don't do X" / "you got the tone wrong" / "that approach is wrong because...") and persist that correction to the brain's `reflections` or `user_model` region. The correction lands, takes effect for the session, then disappears.

**What closing this looks like:**
- Post-turn hook that detects correction signals in user messages (negation of a prior action, explicit "don't do that", rephrasing of a failed output)
- Writes a structured entry to `~/.vanta/brain/reflections.md` and/or `user_model.md`: what was tried, what the correction was, what to do differently
- Pre-turn injection surface already exists (brain is injected into the system prompt each session)
- The self-improvement loop (B3) is the natural integration point: add correction-detection as a second reviewer pass alongside the skill-writing pass

**Why parked:** `REFLECT-CORRECT` is already a named pebble in ROADMAP.md Arc A. This entry adds the concrete spec so the pebble has a done-condition when it's picked up. No new infrastructure needed — `writeRunMemory`, brain regions, and B3's post-turn hook are all live; this is wiring + prompt work.

**Cost to revisit:** S — add correction-signal detector in `review/background-review.ts` (or a new `review/correction-detector.ts`), write to `brain/reflections.md` on match, add to `buildSystemPrompt` injection. 1–2 days including tests.

## Parked agent-worktree builds (pruned 2026-06-14)
**Captured:** 2026-06-14. A 2026-06-10 parallel-agent fanout left 16 isolated `worktree-agent-*` worktrees, each with one CC-parity feature commit, never integrated. The worktrees were pruned for a clean repo; **every commit is preserved as a `parked/<id>` git tag** (recoverable, not on any branch). They were built against the **pre-rebuild** codebase (before the 06-13 real-Ink TUI rebuild deleted `src/tui/` and the size-gate decomposition reshaped `repl/`/`context.ts`/`compress/`), so all conflict with current main — recover = re-port onto current main, not merge.

**Why parked, not merged:** stale (4 days, built on since-deleted/refactored code) + all conflict with main + several likely already superseded. Recover any with `git checkout -b recover-<x> parked/<id>` then re-port the diff by hand.

| Tag | Feature | Likely status |
|-----|---------|---------------|
| `parked/a6217a9b43934ee79` | VANTA-SANDBOX — opt-in OS isolation for shell_cmd + run_code | still missing, valuable |
| `parked/ac9ecf1ed89da1e0e` | AUTH-BROWSER — persistent profile for logged-in sites | still missing, valuable |
| `parked/a5ffcc69a49c6ae86` | VANTA-TOOL-RESULT-DISK — persist oversized tool outputs to disk | still missing, valuable |
| `parked/af2e5090de92795ba` | VANTA-SHELL-STALL-DETECT — background shell stall watchdog | still missing, valuable |
| `parked/a8130bd4887679171` | time-based microcompact — clear stale tool results after idle | still missing, valuable |
| `parked/ac637030536a45f69` | client-side secret scanner blocks secrets from memory sync | still missing, valuable |
| `parked/a25c364f2bcccce87` | LSP diagnostic-delta + edit-file tool (was uncommitted; preserved) | check vs current lsp/ |
| `parked/a54f3a6bcaf32c2f7` | compaction-remind + context.ts (was uncommitted; preserved) | check vs current context.ts |
| `parked/a26e763a2529de5ca` | actionable suggestions when context fills (VANTA-CONTEXT-SUGGESTIONS) | check vs current context UX |
| `parked/a8130bd…` / `parked/aac5129481d980bab` | /compress focus instructions + VANTA_DISABLE_COMPACT gate | check vs current /compress |
| `parked/a9499176bf8ac114a` | 'keep going' resumes prior task; negative-keyword recognition | maybe useful |
| `parked/a3f814553d37a522d` | actionable notice when a config file is invalid JSON | maybe useful |
| `parked/acfb2e69ab2f55425` | VANTA-MEM-FRESHNESS — staleness caveat for memories >1 day | likely superseded (brain has confidence/recency) |
| `parked/a30937211b2e36851` | warn when active model id is a known-deprecated model | maybe useful |
| `parked/a2ed381d918efc514` | TUI-KEYS — readline/Emacs composer keybindings | **obsolete** (built on deleted `src/tui/`) |
| `parked/ad52d4ad12952fd6c` | VANTA-PERMISSIONS — pure rule layer + /permissions cmd | likely superseded (`permissions.tsv` + `loadRules` + `ui/grant.ts` exist) |

All are tracked as `CC-*` roadmap cards; per `STRATEGY.md`, CC parity is "a quarry, not a goal."

## AHE stack import — methodology only, not the code (2026-06-16)
Agentic Harness Engineering (https://github.com/china-qijizhifeng/agentic-harness-engineering) is a strong fit for Vanta's harness/Cofounder pillars, but its **implementation stack is parked, deliberately**: Python 3.13 + `uv` + E2B sandboxes + the NexAU component framework — none of it fits Rust+TS. We steal the *ideas* (falsifiable edits → DECISIONS 2026-06-16; the evaluate→analyze→improve loop → roadmap `AHE-EVAL-HARNESS` / `AHE-TRACE-DISTILLER` / `AHE-SELF-EVOLVE`, all horizon). The auto-evolution loop itself stays unbuilt until Vanta has real users + an eval task set + a reward signal (building it sooner = platform-thinking-before-users). Quarry notes: `docs/agentic-harness-engineering.md`. Cost to revisit: re-read the doc; the loop's prerequisites are the two Harness cards.

## hermes-agent cloud/platform half — against local-first (2026-06-16)
Extracted the local-compatible operator slice of NousResearch/hermes-agent (v0.16.0) into 5 horizon cards (HERMES-KANBAN/-BLUEPRINTS/-SKILLS-HUB/-COST-GUARD/-SUGGESTIONS; see docs/hermes-agent-notes.md). The rest is **parked, deliberately** — it's the opposite of Vanta's north star (local-first, kernel-gated, no platform, no SaaS): cloud/serverless terminal backends (Modal, Daytona, Singularity, cloud-VM, hibernate-wake), the 6 comms platforms beyond Vanta's scope (already parked, Rule of 3), the web dashboard + Nous account/subscription, and the batch trajectory/datagen pipeline (already parked). Most of Hermes's operator surface (cron, webhooks, comms, brain, skills, sessions, subagents, MCP, providers, profiles, voice, pairing, cost tracking) Vanta already has. Cost to revisit: re-read docs/hermes-agent-notes.md; the local copy is at reference/hermes-agent/.
