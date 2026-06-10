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
Audited Claude Code's full feature set (~250 features) for the roadmap; 19 in-scope gaps → `roadmap.json` track "Claude Code parity". These ~45 are **out of scope** for a local, provider-agnostic, kernel-gated operator and were NOT carded — Anthropic-proprietary/cloud/account features: `/passes` `/stickers` `/radio` `/upgrade` `/login` `/logout` `/privacy-settings`, claude.ai teleport / remote-control / `/remote-env` / cloud VMs (`--remote`), Desktop/mobile/Chrome/web surfaces, Bedrock/Vertex setup wizards, GitHub-App / Slack-App installers, cloud reviews (`/ultrareview` `/ultraplan` `/autofix-pr`), `/powerup` `/team-onboarding` `/heapdump` `/release-notes` `/usage-credits` `/color` `/scroll-speed`, managed-agents-onboard. Cost to revisit: re-audit a single feature if Vanta ever grows that surface (e.g. a real desktop app → reopen the IDE/desktop class). (The bundled coding skills `/review` `/simplify` `/verify` `/run` are NOT parked — tracked as `CC-CODING-SKILLS` in `roadmap.json`.)

## Roadmap re-org parks (2026-06-11, STRATEGY.md filter)
166 open cards parked at the 5-pillar re-track (DECISIONS 2026-06-11): Anthropic cloud/account/enterprise coupling, IDE surfaces, their telemetry, duplicates/folds, post-users polish. Full card bodies recoverable from git history (roadmap.json @ 02959a1). Cost to revisit: re-add via `roadmap_add` or restore from git.

- `CC-ABLATION` Ablation baseline mode — single env var disables all advanced features for A/B testing — their internal A/B baseline
- `CC-ADMIN-REQUEST` Admin request flow — limit increase / seat upgrade for team users — seat/limit upgrade flows
- `CC-ANSI-PNG` ANSI-to-PNG renderer — terminal screenshot as PNG with bitmap font — folds into CC-SCREENSHOT-CLIPBOARD
- `CC-ANTI-DISTILL` Anti-distillation beta header — prevent model distillation from CC sessions — their API beta header
- `CC-APPLE-TERMINAL-BACKUP` Apple Terminal backup/restore — recover from interrupted sessions — terminal-specific recovery; sessions/resume exist
- `CC-AUTO-MODE-GA` Auto mode GA — no opt-in required, available for Max/Opus 4.7+ — their plan gating of auto mode
- `CC-AUTOUPDATE` Auto-updates channel + version enforcement settings — folds into CC-AUTO-UPDATER
- `CC-AUTOUPDATE-UI` In-TUI auto-updater — update notification + one-click upgrade — folds into CC-AUTO-UPDATER
- `CC-AWAY-RECAP` Away summary — recap on return to an idle session — duplicate of CC-AWAY-SUMMARY
- `CC-AWS-BEDROCK-PROVIDER` AWS Bedrock provider — full Bedrock deployment with inference profiles, STS, cross-region — DECISIONS 2026-06-09: curated 8 providers; Bedrock = post-v1
- `CC-BACKGROUND-REMOTE-SESSION` Background remote sessions — spawn CCR sessions in background with precondition checks — CCR background sessions
- `CC-BASH-PARSER-TS` Pure-TypeScript bash parser — tree-sitter-compatible AST for permission analysis — alternative to CC-TREE-SITTER-BASH (keep one parser)
- `CC-BEDROCK-WIZARD` Bedrock interactive setup wizard — guided AWS credentials and region config — DECISIONS 2026-06-09: curated 8 providers
- `CC-BG-SESSION-CMDS` Background session process manager — `claude ps/logs/attach/kill` + `--bg` flag — duplicate of CC-BG-AGENTS
- `CC-BOOTSTRAP-MODEL-OPTIONS` Bootstrap API — server-side additional model options list — server-side model list from their API
- `CC-BRIDGE-CCR` CCR bridge — connect local TUI to remote cloud sessions with polling — bridge local TUI to their cloud sessions
- `CC-BRIDGE-QR` Bridge QR code — scannable QR for mobile/remote connection to live session — QR onto a remote bridge Vanta doesn't have; revisit with gateway
- `CC-BUDDY` Companion buddy — animated ASCII creature with species, rarity, stats — ASCII pet — post-users
- `CC-BUN-WEBVIEW` Bun WebView — native embedded browser panel inside the terminal — embedded browser panel — browser tools + DESKTOP cover it
- `CC-BYOC-SETUP` /remote-setup — BYOC container setup with GitHub OAuth token — their BYOC remote setup
- `CC-CCR-AUTO-CONNECT` CCR auto-connect — auto-start CCR on session launch via GrowthBook gate — GrowthBook-gated CCR autostart
- `CC-CCR-MIRROR` CCR mirror mode — outbound-only session mirroring to claude.ai — mirror to claude.ai
- `CC-CCR-REMOTE-SETUP` Remote setup wizard — `web` command for guided CCR onboarding — CCR onboarding wizard
- `CC-CEDAR-SYNTAX` Cedar policy syntax highlighting — `.cedar` and `.cedarpolicy` files — AWS Cedar highlighting — niche
- `CC-CHROME-EXTENSION-PROMPTS` Prompts from Claude for Chrome — browser extension sends prompts to terminal — Claude-for-Chrome coupling
- `CC-CHROME-NATIVE-SETUP` Claude in Chrome setup — install native messaging host for all Chromium browsers — their Chrome native host
- `CC-CLAUDE-API-SKILL` Claude API skill — built-in skill for building Claude API applications — their API docs content skill
- `CC-CLI-HIGHLIGHT` Syntax highlighting — colored code blocks in CLI output via cli-highlight — duplicate of CC-HIGHLIGHTED-CODE
- `CC-CLIENT-ATTEST` Native client attestation — cch= token in User-Agent for first-party auth — their first-party auth attestation
- `CC-CLOUD-CREDS` Cloud credential refresh scripts — AWS, GCP, API key helper, OTel — AWS/GCP cred refresh — enterprise
- `CC-CODE-REVIEW-CMD` `/code-review` — renamed from `/simplify`; runs correctness review at chosen effort — their command-rename trivia
- `CC-COLOR-PROMPT` /color — set prompt bar accent color for current session — /color was in the 2026-06-07 excluded list
- `CC-COLOR-RANDOM` `/color` with no args — picks a random session color — /color trivia
- `CC-CONNECTOR-TEXT` Connector text blocks — render summarize-connector-text beta with streaming awareness — their beta block type
- `CC-COWORK-MODE` Cowork mode — separate plugin directory for teammate/collaborative sessions — their collaborative product (XL)
- `CC-COWORKER-TYPE` Coworker type analytics — CLAUDE_CODE_COWORKER_TYPE env logged to session metadata — their analytics env
- `CC-DESKTOP-HANDOFF` `/desktop` — download and launch the Claude desktop app from terminal — downloads their desktop app; Vanta DESKTOP track exists
- `CC-DESKTOP-UPSELL` Desktop app upsell dialog — GrowthBook-gated prompt to try Claude Code Desktop — GrowthBook upsell dialog
- `CC-DIRECT-CONNECT-SERVER` Direct-connect server — CC as local HTTP+WebSocket server for IDE/client connections — duplicate of DESKTOP-P3 architecture
- `CC-DISABLE-UPDATES-ENV` `DISABLE_UPDATES` — completely block all update paths including manual `claude update` — folds into CC-AUTO-UPDATER
- `CC-EXTRA-USAGE-CMD` /extra-usage — configure overage provisioning to keep working past rate limits — overage provisioning — their billing
- `CC-FAST-MODE-IMPL` Fast mode — Opus 4.6 with rate-limit cooldown circuit breaker — their fast-mode product/rate-limit coupling; Vanta has model routing
- `CC-FEEDBACK-CMD` /feedback slash command — report issues or suggestions from within the session — reports to their tracker; /bug exists
- `CC-FEEDBACK-SURVEY-UI` Feedback survey UI — in-session survey with transcript sharing — their survey pipeline
- `CC-FIG-CMD-SPECS` Fig/withfig autocomplete spec loading — command argument security validation — withfig spec dependency — niche
- `CC-FILE-HISTORY-SNAP` File history snapshots — hardlink-based file state capture before edits — folds into CC-REWIND (its mechanism)
- `CC-FILE-PERSIST` File persistence — BYOC session file state snapshot between turns — BYOC cloud session state
- `CC-FILES-API` Files API integration — upload session files to Anthropic cloud storage — uploads to Anthropic cloud storage
- `CC-FPS-METRICS` TUI FPS metrics — render performance monitoring — TUI perf monitoring — revisit if TUI-V2 perf hurts
- `CC-GIT-REPO-SESSION` Git-sourced remote sessions — create remote session from a git repository URL — remote sessions in their cloud
- `CC-GROVE` Grove — data privacy/consent opt-in dialog at onboarding and policy updates — their telemetry consent dialog
- `CC-H-ACCOUNT` Account / billing / fun — their account/billing/fun
- `CC-H-AGENT-TEAMS` Multi-session agent teams — umbrella duplicate of CC-TEAMS cluster
- `CC-H-BROWSER-IDE` IDE extensions + browser — IDE-plugin class excluded (PARKED 2026-06-07)
- `CC-H-CLOUD-REVIEW` Cloud multi-agent review — Anthropic cloud review product
- `CC-H-CLOUD-SESSION` Cloud VM sessions — Anthropic cloud VMs
- `CC-H-DESKTOP-APP` Desktop/web app surfaces — duplicate of DESKTOP track
- `CC-H-ENTERPRISE` Enterprise backends + telemetry — their enterprise backends + telemetry
- `CC-H-MISC` Misc product polish — vague umbrella card
- `CC-H-MOBILE` Mobile app — Anthropic mobile app surface
- `CC-H-REMOTE-CONTROL` Remote control + teleport — claude.ai remote control/teleport
- `CC-H-SDK` Agent SDK / Managed Agents — their SDK/managed-agents product; PLUGIN-FRAMEWORK covers extensibility
- `CC-HARD-FAIL` Hard fail mode — crash on logError calls for test harness reliability — their test-harness mode
- `CC-HOOKS` User-configurable lifecycle hooks — duplicate of CC-HOOKS-ENGINE
- `CC-HTTPS-PROXY` HTTPS proxy support — route API calls through corporate proxy — corporate proxy — post-users
- `CC-IDE-AUTO-CONNECT` IDE auto-connect dialog — prompt to enable/disable automatic IDE connection — IDE integration
- `CC-IDE-DIFF` IDE diff integration — open file edits in IDE diff viewer — IDE integration
- `CC-JETBRAINS` JetBrains IDE integration — detect and connect to PyCharm, IntelliJ, WebStorm, etc. — IDE integration
- `CC-KAIROS` KAIROS assistant mode — claude.ai-integrated assistant with brief/proactive/channels — claude.ai-integrated assistant mode
- `CC-KAIROS-CHANNELS` KAIROS channels — MCP push notification channel subscriptions via --channels flag — their push channel subscriptions
- `CC-KAIROS-GITHUB` GitHub PR webhook subscription — subscribe-pr command + SubscribePRTool — their PR webhook product; AUTO-WATCH covers watching
- `CC-LOGO-ANIMATED` Animated startup — AnimatedAsterisk, feed system, channels notice — startup animation + feed — post-users
- `CC-MANAGED-DOMAIN-SECURITY` Managed domain security — `allowManagedDomainsOnly` enforced across all settings sources — managed-domain enforcement
- `CC-MANAGED-PLUGINS` Org-managed plugins — policy enforcement for required/disabled plugins — org plugin policy
- `CC-MANAGED-POLICY` Managed policy scope — org-wide CLAUDE.md and dynamic settings — org-managed policy — enterprise
- `CC-MARKETPLACE-AUTO-INSTALL` Official marketplace auto-install — startup check installs missing official plugins — duplicate of bundled-skill auto-install (shipped)
- `CC-MCP-AUTH-TOOL` McpAuthTool — pseudo-tool that starts OAuth flow for unauthenticated MCP servers — duplicate of CC-MCP-AUTH
- `CC-MDM-SETTINGS` MDM enterprise settings — OS-level policy enforcement (macOS/Windows/Linux) — MDM enterprise enforcement
- `CC-MEMORY-MONITOR` Process memory monitor — high/critical heap alerts — duplicate of CC-MEMORY-WARN
- `CC-MEMORY-SHAPE` Memory shape telemetry — track memory recall patterns for analytics — recall telemetry for their analytics
- `CC-MSG-RATE-LIMIT` Rich rate-limit message — upsell, /upgrade, /extra-usage, tier-aware — tier upsell messaging
- `CC-MTLS-CONFIG` mTLS + custom CA cert config — enterprise proxy TLS support — enterprise proxy TLS
- `CC-NOTEBOOK` Notebook edit tool — Jupyter cell editing — Jupyter — no demand yet
- `CC-OTEL-ENTRYPOINT` OTEL `app.entrypoint` metric attribute — segment metrics by session entrypoint — no observability before users
- `CC-OTEL-RAW-BODIES` `OTEL_LOG_RAW_API_BODIES` — emit full API request/response bodies as OTEL log events — no observability before users
- `CC-OTEL-RESOURCE-ATTRS` `OTEL_RESOURCE_ATTRIBUTES` as metric labels — slice usage metrics by custom dimensions — no observability before users
- `CC-OTEL-TRACING` Enhanced telemetry beta — OTEL session tracing via OTEL_TRACES_EXPORTER — no observability before users; events.jsonl exists
- `CC-OVERAGE-CREDIT-GRANT` Overage credit grant — one-click extra credits when hitting rate limit — their billing credits
- `CC-OVERFLOW-TEST` OverflowTestTool — synthetic tool to test context overflow handling — synthetic overflow tool — build when testing compaction
- `CC-PASSES-REFERRAL` /passes — view Claude usage passes and referral reward balance — their referral program
- `CC-PERFETTO` Perfetto tracing — Chrome Perfetto-compatible performance trace export — perf tracing — post-users
- `CC-PERFORCE-MODE` `CLAUDE_CODE_PERFORCE_MODE` — fail on read-only files with `p4 edit` hint — Perforce — niche VCS
- `CC-PKG-MANAGER-UPDATE` Package manager auto-updater — in-TUI update prompt via brew/npm/apt — folds into CC-AUTO-UPDATER
- `CC-PLUGIN-ONLY-POLICY` Plugin-only customization policy — lock skills/hooks/styles to plugins only — org customization lockdown
- `CC-POLICY-LIMITS` Org policy limits — admin-configurable feature restrictions via remote API — org admin remote API
- `CC-POWERSHELL` PowerShell tool — Windows shell execution — Windows — macOS-first for now
- `CC-POWERSHELL-AUTO` PowerShell auto-approve guidance — include PS guidance in yolo classifier prompt — Windows — macOS-first for now
- `CC-PRIVACY-SETTINGS-CMD` /privacy-settings — view and update data collection privacy preferences — their data-collection prefs; Vanta is local
- `CC-PROMPT-SUGGEST` --prompt-suggestions — emit predicted next prompts for IDE/shell integration — IDE/shell emit variant; CC-PROMPT-SUGGEST-UI keeps the in-TUI version
- `CC-PUSH-NOTIFY` Mobile push notifications — alert when task completes or input needed — mobile push via their Remote Control; Telegram notify exists
- `CC-QUICK-SEARCH` Quick search — keyboard-triggered search overlay without opening a modal — duplicate of CC-SEARCH-BOX
- `CC-REDACT-THINKING` Redact thinking beta — server-side redaction of thinking blocks — their server-side beta
- `CC-RELEASE-CHANNELS` Release channels — stable/beta/custom update channel selection — folds into CC-AUTO-UPDATER
- `CC-RELEASE-NOTES-CMD` /release-notes — view in-session release notes for current version — their release notes (was in 2026-06-07 excluded list)
- `CC-REMOTE-CALLOUT` Remote Control first-run callout — onboarding dialog for CCR setup — CCR onboarding dialog
- `CC-REMOTE-ENV-CMD` /remote-env — configure default remote environment for teleport sessions — teleport env config
- `CC-REMOTE-MANAGED-SETTINGS` Remote managed settings — enterprise org policies via API with dangerous-change security gate — enterprise org policies via API
- `CC-REMOTE-TRIGGER` Remote trigger tool — list/run cloud-side triggers — cloud trigger registry, requires Anthropic OAuth; local cron + webhooks exist
- `CC-REMOTE-VIEWER` Remote session viewer mode — observe a CCR session without interrupting — observe a CCR session
- `CC-SDK-IDLE-TIMEOUT` SDK idle timeout — auto-exit SDK sessions after configurable idle delay — their SDK runtime detail
- `CC-SED-EDIT-RENDER` Sed in-place edit rendering — show sed -i commands as file diffs — niche render nicety
- `CC-SEND-MESSAGE-TOOL` SendMessageTool — agent-to-agent messaging within swarms (mailbox-based) — duplicate of CC-SEND-MSG
- `CC-SESSION-TELEPORT` Session teleport + remote — cross-device session continuation flags — cross-device via their cloud
- `CC-SETTINGS-SYNC` Settings sync — sync user settings and memory across CC environments — settings sync via their cloud
- `CC-SETUP-TOKEN` vanta setup-token — long-lived OAuth token for CI/automation — long-lived OAuth token for their account system
- `CC-SHARE-ONBOARDING` ShareOnboardingGuide tool + /team-onboarding command — team onboarding product
- `CC-SHELL-COMPLETION-INSTALL` Shell completion install — add `claude` tab-completion to bash/zsh/fish rc files — already shipped (CLI-DX-PACK completion)
- `CC-SHOT-STATS` Shot distribution stats — track shots-per-session histogram in /stats — niche analytics histogram
- `CC-SKIP-VERSION` Skip update version — snooze a specific CLI update version permanently — folds into CC-AUTO-UPDATER
- `CC-SLOW-OP-LOG` Slow operation logging — detect and log slow operations with Anthropic-specific hooks — Anthropic-specific hooks
- `CC-SPECULATION-ENGINE` Speculative prompt pre-execution — pre-run predicted next command before user submits — pre-executes predicted commands — conflicts rule zero (approval-first)
- `CC-STATUS-CMD` /status — show version, model, account, API health, tool statuses — already shipped (/status in REPL)
- `CC-STREAMLINED-OUTPUT` Streamlined JSON output — compact stream-json transformer via env flag — duplicate of CC-JSON-SCHEMA/--bare output modes
- `CC-SWARM-IT2-SETUP` iTerm2 swarm backend — multi-pane swarm via iTerm2 Python API — iTerm2 Python API backend; CC-SWARM-TMUX is the one mux backend
- `CC-SWARM-PERM-SYNC` Swarm synchronized permissions — workers forward permission requests to leader UI — duplicate of CC-SWARM-PERM-ROUTING
- `CC-TASK-BUDGETS` Task budgets — per-task token allocation via beta header — their beta header; VANTA_MAX_ITER + CC-BUDGET-CAP cover budgets
- `CC-TEAM-MEMORY-SYNC` Team memory sync — per-repo shared memory across org members via API — org memory sync via their API
- `CC-TEAM-TOOLS` TeamCreate/TeamDelete tools — spawn and disband named agent teams from within a session — duplicate of CC-TEAMS
- `CC-TEAMMATE-MODE` --teammate-mode — agent team UI display mode — their teammate product UI
- `CC-TEST-VERSIONS` Allow test versions — install and run 99.99.x CC versions for internal testing — their internal 99.99.x builds
- `CC-THINKBACK` /thinkback — year-in-review animation for annual usage summary — year-in-review animation — post-users
- `CC-TMUX` Tmux integration for worktrees — --tmux flag — folds into CC-WORKTREE
- `CC-TORCH` /torch command — internal performance benchmarking / flame graph tool — their internal benchmarking
- `CC-TURN-DIFFS` Per-turn file diff history — track file changes by turn index — folds into CC-REWIND
- `CC-ULTRAPLAN` Ultraplan keyword trigger — multi-agent planning mode from prompt keyword — remote CCR planning; local multi-agent planning = CC-PLAN-MODE-V2
- `CC-ULTRAPLAN-CMD` /ultraplan — launch multi-agent CCR planning session from keyword or command — remote CCR planning command
- `CC-ULTRAREVIEW-CLI` `claude ultrareview` — run cloud multi-agent code review non-interactively from CI — their cloud review from CI
- `CC-ULTRAREVIEW-QUOTA` /code-review ultra — quota-tracked cloud deep review with overage detection — their quota-tracked cloud review
- `CC-UPGRADE-CMD` /upgrade — in-session subscription upgrade to Max plan — subscription upsell
- `CC-UPLOAD-SETTINGS` Background settings upload — sync local settings to cloud on session start — settings upload to their cloud
- `CC-USAGE-CMD` /usage — show claude.ai plan usage and limits — claude.ai plan usage; Vanta /usage (COST-VISIBLE) exists
- `CC-USAGE-UTILIZATION` Rate limit utilization display — 5hr/7day windows, per-model, extra credits — their plan rate-limit windows
- `CC-VERSION-POLICY` `requiredMinimumVersion` / `requiredMaximumVersion` — managed settings version enforcement — managed version enforcement
- `CC-VERTEX-PROVIDER` Google Vertex AI provider — full Vertex deployment with GCP auth refresh — DECISIONS 2026-06-09: curated 8 providers
- `CC-VERTEX-WIZARD` Vertex AI interactive setup wizard — guided GCP project and auth config — DECISIONS 2026-06-09: curated 8 providers
- `CC-VOICE-MODE` /voice — voice input mode toggle for hands-free use — their flag-gated /voice; CC-VOICE-STT + VOICE-NATURAL cover it
- `CC-WEB-SETUP` /web-setup — connect GitHub account and configure remote web sessions — their remote web sessions (XL)
- `CC-WORKSPACE-ID-ENV` `ANTHROPIC_WORKSPACE_ID` — scope minted OAuth tokens to a specific workspace — scopes their minted OAuth tokens
- `CC-WORKTREE-BASE-REF` `worktree.baseRef` — choose `fresh` or `head` as the worktree branch base — folds into CC-WORKTREE
- `CC-WORKTREE-BG-ISOLATION` `worktree.bgIsolation: "none"` — let background agents edit working copy directly — folds into CC-WORKTREE
- `CC-WORKTREE-EXIT-DIALOG` Worktree exit dialog — confirmation when leaving a worktree — folds into CC-WORKTREE
- `CC-WORKTREE-PATH-PARAM` `EnterWorktree` path param — switch into an existing worktree mid-session — folds into CC-WORKTREE
- `CC-WRITE-IDE-DIFF` Write tool IDE diff feedback — model notified when you edit proposed content before accepting — IDE integration
- `HP-BATCH-SWE-TRAJECTORY-DATAGEN` Batch/SWE/trajectory/datagen (RL pipeline) — RL/datagen pipeline — platform-thinking before users
- `HP-CLAW` Claw (Reference migration) — vague umbrella; duplicate of CODEBASE-MINE
- `HP-HOOKS` Hooks (shell-script, list/test/revoke) — duplicate of CC-HOOKS-ENGINE
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
