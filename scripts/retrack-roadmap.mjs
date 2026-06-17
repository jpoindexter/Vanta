// One-shot roadmap re-org to the 5-pillar spine (STRATEGY.md, DECISIONS 2026-06-11).
// Deterministic + auditable: every OPEN "Claude Code parity" card is explicitly
// classified below; the script throws if one is present but unlisted. Parked cards
// are REMOVED from roadmap.json (one-liners go to PARKED.md via /tmp/parked-section.md;
// full bodies recoverable from git history @ 02959a1). Re-runnable: already-parked ids
// simply aren't present on the second pass.
//
//   node scripts/retrack-roadmap.mjs [--dry]
import { readFileSync, writeFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");
const DATE = "2026-06-11";
const PATH = "roadmap.json";

const PILLARS = ["Harness", "Operator", "Solutioning", "Extensibility", "Cofounder engine"];

// ---- non-CC tracks → pillar (applies to every status) ----------------------
const TRACK_MAP = {
  Foundation: "Harness",
  "Executive Function (inclusive spine)": "Operator",
  "Executive function": "Operator",
  "Memory + Continuity": "Operator",
  Memory: "Operator",
  Continuity: "Harness",
  "TUI parity": "Operator",
  "TUI / UX": "Operator",
  "Core UX": "Operator",
  Operator: "Operator",
  "Self-improvement": "Harness",
  Platform: "Operator",
  "Models + Setup": "Harness",
  "Autonomy + Reach": "Operator",
  "Reliability (ND trust)": "Harness",
  Reliability: "Harness",
  "Senses + Autonomy": "Operator",
  "Factory evolution": "Harness",
  Selfhood: "Operator",
  Efficiency: "Harness",
  Skills: "Extensibility",
  "Docs + Tooling": "Harness",
  Solutioning: "Solutioning",
  "MCP: use · make · serve": "Extensibility",
  Research: "Solutioning",
  "Release hygiene": "Harness",
  "Code health": "Harness",
  "Auxiliary tasks": "Harness",
  Multimodal: "Operator",
  Bugs: "Harness",
  Autonomy: "Operator",
};

// non-CC cards whose track-level default is wrong
const NON_CC_OVERRIDES = {
  "AUTO-WATCH": "Solutioning", // the watch-half of the solutioning loop
  "PLUGIN-FRAMEWORK": "Extensibility",
  "HP-169-BUNDLED-SKILLS": "Extensibility",
  "HP-BUNDLES": "Extensibility",
  "HP-COMPUTER-USE": "Operator",
};

// non-CC OPEN cards that park (id → reason)
const NON_CC_PARK = {
  "HP-BATCH-SWE-TRAJECTORY-DATAGEN": "RL/datagen pipeline — platform-thinking before users",
  "HP-CLAW": "vague umbrella; duplicate of CODEBASE-MINE",
  "HP-I18N": "16 locales — post-users (no platform-thinking before users)",
  "HP-INFOGRAPHIC": "C2PA-signed asset generation — niche, no pillar",
  "HP-INSIGHTS-ANALYTICS": "analytics surface — post-users",
  "HP-NOUS-PORTAL": "hosted inference + subscriptions = SaaS — anti-strategy (local-first, no platform)",
  "HP-PAIRING-CODES": "device pairing — Vanta has no remote surface to pair",
  "HP-PLUGIN-FRAMEWORK": "duplicate of PLUGIN-FRAMEWORK (rock)",
  "HP-PROFILE-DESCRIBE-DISTRIBUTE": "profile git-sharing — post-users",
  "HP-SKIN-ENGINE": "YAML theme engine — cosmetic, post-users",
  "HP-TIPS": "startup tips — post-users polish",
  "HP-WEB-DASHBOARD": "duplicate surface: kernel cockpit + roadmap serve + DESKTOP track",
  "HP-HOOKS": "duplicate of VANTA-HOOKS-ENGINE",
};

// ---- OPEN "Claude Code parity" cards: explicit, exhaustive ------------------
const P = "PARK";
const CC_OPEN = {
  // — PARK: Anthropic cloud / account / billing / CCR / claude.ai coupling —
  "VANTA-H-CLOUD-SESSION": [P, "Anthropic cloud VMs"],
  "VANTA-H-REMOTE-CONTROL": [P, "claude.ai remote control/teleport"],
  "VANTA-H-MOBILE": [P, "Anthropic mobile app surface"],
  "VANTA-H-CLOUD-REVIEW": [P, "Anthropic cloud review product"],
  "VANTA-H-ACCOUNT": [P, "their account/billing/fun"],
  "VANTA-H-ENTERPRISE": [P, "their enterprise backends + telemetry"],
  "VANTA-H-SDK": [P, "their SDK/managed-agents product; PLUGIN-FRAMEWORK covers extensibility"],
  "VANTA-H-MISC": [P, "vague umbrella card"],
  "VANTA-REMOTE-TRIGGER": [P, "cloud trigger registry, requires Anthropic OAuth; local cron + webhooks exist"],
  "VANTA-SETUP-TOKEN": [P, "long-lived OAuth token for their account system"],
  "VANTA-SESSION-TELEPORT": [P, "cross-device via their cloud"],
  "VANTA-CLOUD-CREDS": [P, "AWS/GCP cred refresh — enterprise"],
  "VANTA-MANAGED-POLICY": [P, "org-managed policy — enterprise"],
  "VANTA-SETTINGS-SYNC": [P, "settings sync via their cloud"],
  "VANTA-UPLOAD-SETTINGS": [P, "settings upload to their cloud"],
  "VANTA-REMOTE-MANAGED-SETTINGS": [P, "enterprise org policies via API"],
  "VANTA-MDM-SETTINGS": [P, "MDM enterprise enforcement"],
  "VANTA-POLICY-LIMITS": [P, "org admin remote API"],
  "VANTA-ADMIN-REQUEST": [P, "seat/limit upgrade flows"],
  "VANTA-MANAGED-PLUGINS": [P, "org plugin policy"],
  "VANTA-PLUGIN-ONLY-POLICY": [P, "org customization lockdown"],
  "VANTA-MANAGED-DOMAIN-SECURITY": [P, "managed-domain enforcement"],
  "VANTA-VERSION-POLICY": [P, "managed version enforcement"],
  "VANTA-TEAM-MEMORY-SYNC": [P, "org memory sync via their API"],
  "VANTA-BOOTSTRAP-MODEL-OPTIONS": [P, "server-side model list from their API"],
  "VANTA-OVERAGE-CREDIT-GRANT": [P, "their billing credits"],
  "VANTA-MSG-RATE-LIMIT": [P, "tier upsell messaging"],
  "VANTA-USAGE-CMD": [P, "claude.ai plan usage; Vanta /usage (COST-VISIBLE) exists"],
  "VANTA-USAGE-UTILIZATION": [P, "their plan rate-limit windows"],
  "VANTA-EXTRA-USAGE-CMD": [P, "overage provisioning — their billing"],
  "VANTA-UPGRADE-CMD": [P, "subscription upsell"],
  "VANTA-PASSES-REFERRAL": [P, "their referral program"],
  "VANTA-PRIVACY-SETTINGS-CMD": [P, "their data-collection prefs; Vanta is local"],
  "VANTA-GROVE": [P, "their telemetry consent dialog"],
  "VANTA-CLIENT-ATTEST": [P, "their first-party auth attestation"],
  "VANTA-ANTI-DISTILL": [P, "their API beta header"],
  "VANTA-COWORKER-TYPE": [P, "their analytics env"],
  "VANTA-MEMORY-SHAPE": [P, "recall telemetry for their analytics"],
  "VANTA-TEST-VERSIONS": [P, "their internal 99.99.x builds"],
  "VANTA-DESKTOP-HANDOFF": [P, "downloads their desktop app; Vanta DESKTOP track exists"],
  "VANTA-DESKTOP-UPSELL": [P, "GrowthBook upsell dialog"],
  "VANTA-CHROME-EXTENSION-PROMPTS": [P, "Claude-for-Chrome coupling"],
  "VANTA-CHROME-NATIVE-SETUP": [P, "their Chrome native host"],
  "VANTA-VOICE-MODE": [P, "their flag-gated /voice; VANTA-VOICE-STT + VOICE-NATURAL cover it"],
  "VANTA-FILE-PERSIST": [P, "BYOC cloud session state"],
  "VANTA-SDK-IDLE-TIMEOUT": [P, "their SDK runtime detail"],
  "VANTA-AUTO-MODE-GA": [P, "their plan gating of auto mode"],
  "VANTA-FAST-MODE-IMPL": [P, "their fast-mode product/rate-limit coupling; Vanta has model routing"],
  "VANTA-TASK-BUDGETS": [P, "their beta header; VANTA_MAX_ITER + VANTA-BUDGET-CAP cover budgets"],
  "VANTA-REDACT-THINKING": [P, "their server-side beta"],
  "VANTA-WORKSPACE-ID-ENV": [P, "scopes their minted OAuth tokens"],
  "VANTA-SLOW-OP-LOG": [P, "Anthropic-specific hooks"],
  "VANTA-CONNECTOR-TEXT": [P, "their beta block type"],
  "VANTA-SHARE-ONBOARDING": [P, "team onboarding product"],
  "VANTA-TEAMMATE-MODE": [P, "their teammate product UI"],
  "VANTA-COWORK-MODE": [P, "their collaborative product (XL)"],
  "VANTA-CLAUDE-API-SKILL": [P, "their API docs content skill"],
  "VANTA-RELEASE-NOTES-CMD": [P, "their release notes (was in 2026-06-07 excluded list)"],
  "VANTA-CODE-REVIEW-CMD": [P, "their command-rename trivia"],
  "VANTA-FEEDBACK-CMD": [P, "reports to their tracker; /bug exists"],
  "VANTA-FEEDBACK-SURVEY-UI": [P, "their survey pipeline"],
  "VANTA-STATUS-CMD": [P, "already shipped (/status in REPL)"],
  "VANTA-BRIDGE-QR": [P, "QR onto a remote bridge Vanta doesn't have; revisit with gateway"],
  "VANTA-BACKGROUND-REMOTE-SESSION": [P, "CCR background sessions"],
  "VANTA-BYOC-SETUP": [P, "their BYOC remote setup"],
  "VANTA-REMOTE-VIEWER": [P, "observe a CCR session"],
  "VANTA-GIT-REPO-SESSION": [P, "remote sessions in their cloud"],
  "VANTA-CCR-MIRROR": [P, "mirror to claude.ai"],
  "VANTA-CCR-AUTO-CONNECT": [P, "GrowthBook-gated CCR autostart"],
  "VANTA-CCR-REMOTE-SETUP": [P, "CCR onboarding wizard"],
  "VANTA-REMOTE-CALLOUT": [P, "CCR onboarding dialog"],
  "VANTA-WEB-SETUP": [P, "their remote web sessions (XL)"],
  "VANTA-REMOTE-ENV-CMD": [P, "teleport env config"],
  "VANTA-ULTRAPLAN": [P, "remote CCR planning; local multi-agent planning = VANTA-PLAN-MODE-V2"],
  "VANTA-ULTRAPLAN-CMD": [P, "remote CCR planning command"],
  "VANTA-ULTRAREVIEW-QUOTA": [P, "their quota-tracked cloud review"],
  "VANTA-ULTRAREVIEW-CLI": [P, "their cloud review from CI"],
  "VANTA-KAIROS": [P, "claude.ai-integrated assistant mode"],
  "VANTA-KAIROS-CHANNELS": [P, "their push channel subscriptions"],
  "VANTA-KAIROS-GITHUB": [P, "their PR webhook product; AUTO-WATCH covers watching"],
  "VANTA-PUSH-NOTIFY": [P, "mobile push via their Remote Control; Telegram notify exists"],
  "VANTA-BRIDGE-CCR": [P, "bridge local TUI to their cloud sessions"],
  "VANTA-FILES-API": [P, "uploads to Anthropic cloud storage"],
  // — PARK: enterprise/infra + their internal test tooling —
  "VANTA-MTLS-CONFIG": [P, "enterprise proxy TLS"],
  "VANTA-HTTPS-PROXY": [P, "corporate proxy — post-users"],
  "VANTA-AWS-BEDROCK-PROVIDER": [P, "DECISIONS 2026-06-09: curated 8 providers; Bedrock = post-v1"],
  "VANTA-VERTEX-PROVIDER": [P, "DECISIONS 2026-06-09: curated 8 providers"],
  "VANTA-BEDROCK-WIZARD": [P, "DECISIONS 2026-06-09: curated 8 providers"],
  "VANTA-VERTEX-WIZARD": [P, "DECISIONS 2026-06-09: curated 8 providers"],
  "VANTA-OTEL-TRACING": [P, "no observability before users; events.jsonl exists"],
  "VANTA-OTEL-RAW-BODIES": [P, "no observability before users"],
  "VANTA-OTEL-ENTRYPOINT": [P, "no observability before users"],
  "VANTA-OTEL-RESOURCE-ATTRS": [P, "no observability before users"],
  "VANTA-PERFETTO": [P, "perf tracing — post-users"],
  "VANTA-TORCH": [P, "their internal benchmarking"],
  "VANTA-FPS-METRICS": [P, "TUI perf monitoring — revisit if TUI-V2 perf hurts"],
  "VANTA-HARD-FAIL": [P, "their test-harness mode"],
  "VANTA-ABLATION": [P, "their internal A/B baseline"],
  "VANTA-OVERFLOW-TEST": [P, "synthetic overflow tool — build when testing compaction"],
  // — PARK: IDE / other-platform surfaces —
  "VANTA-H-BROWSER-IDE": [P, "IDE-plugin class excluded (PARKED 2026-06-07)"],
  "VANTA-IDE-DIFF": [P, "IDE integration"],
  "VANTA-IDE-AUTO-CONNECT": [P, "IDE integration"],
  "VANTA-JETBRAINS": [P, "IDE integration"],
  "VANTA-WRITE-IDE-DIFF": [P, "IDE integration"],
  "VANTA-PROMPT-SUGGEST": [P, "IDE/shell emit variant; VANTA-PROMPT-SUGGEST-UI keeps the in-TUI version"],
  "VANTA-POWERSHELL": [P, "Windows — macOS-first for now"],
  "VANTA-POWERSHELL-AUTO": [P, "Windows — macOS-first for now"],
  "VANTA-PERFORCE-MODE": [P, "Perforce — niche VCS"],
  "VANTA-CEDAR-SYNTAX": [P, "AWS Cedar highlighting — niche"],
  "VANTA-NOTEBOOK": [P, "Jupyter — no demand yet"],
  "VANTA-BUN-WEBVIEW": [P, "embedded browser panel — browser tools + DESKTOP cover it"],
  "VANTA-APPLE-TERMINAL-BACKUP": [P, "terminal-specific recovery; sessions/resume exist"],
  "VANTA-FIG-CMD-SPECS": [P, "withfig spec dependency — niche"],
  "VANTA-SWARM-IT2-SETUP": [P, "iTerm2 Python API backend; VANTA-SWARM-TMUX is the one mux backend"],
  // — PARK: rule-zero conflict —
  "VANTA-SPECULATION-ENGINE": [P, "pre-executes predicted commands — conflicts rule zero (approval-first)"],
  // — PARK: cosmetic / post-users —
  "VANTA-THINKBACK": [P, "year-in-review animation — post-users"],
  "VANTA-BUDDY": [P, "ASCII pet — post-users"],
  "VANTA-LOGO-ANIMATED": [P, "startup animation + feed — post-users"],
  "VANTA-COLOR-PROMPT": [P, "/color was in the 2026-06-07 excluded list"],
  "VANTA-COLOR-RANDOM": [P, "/color trivia"],
  "VANTA-SED-EDIT-RENDER": [P, "niche render nicety"],
  "VANTA-SHOT-STATS": [P, "niche analytics histogram"],
  // — PARK: duplicates / folds (keeper noted) —
  "VANTA-SEND-MESSAGE-TOOL": [P, "duplicate of VANTA-SEND-MSG"],
  "VANTA-TEAM-TOOLS": [P, "duplicate of VANTA-TEAMS"],
  "VANTA-H-AGENT-TEAMS": [P, "umbrella duplicate of VANTA-TEAMS cluster"],
  "VANTA-HOOKS": [P, "duplicate of VANTA-HOOKS-ENGINE"],
  "VANTA-MCP-AUTH-TOOL": [P, "duplicate of VANTA-MCP-AUTH"],
  "VANTA-AWAY-RECAP": [P, "duplicate of VANTA-AWAY-SUMMARY"],
  "VANTA-MEMORY-MONITOR": [P, "duplicate of VANTA-MEMORY-WARN"],
  "VANTA-SWARM-PERM-SYNC": [P, "duplicate of VANTA-SWARM-PERM-ROUTING"],
  "VANTA-BG-SESSION-CMDS": [P, "duplicate of VANTA-BG-AGENTS"],
  "VANTA-BASH-PARSER-TS": [P, "alternative to VANTA-TREE-SITTER-BASH (keep one parser)"],
  "VANTA-CLI-HIGHLIGHT": [P, "duplicate of VANTA-HIGHLIGHTED-CODE"],
  "VANTA-QUICK-SEARCH": [P, "duplicate of VANTA-SEARCH-BOX"],
  "VANTA-ANSI-PNG": [P, "folds into VANTA-SCREENSHOT-CLIPBOARD"],
  "VANTA-FILE-HISTORY-SNAP": [P, "folds into VANTA-REWIND (its mechanism)"],
  "VANTA-TURN-DIFFS": [P, "folds into VANTA-REWIND"],
  "VANTA-TMUX": [P, "folds into VANTA-WORKTREE"],
  "VANTA-WORKTREE-EXIT-DIALOG": [P, "folds into VANTA-WORKTREE"],
  "VANTA-WORKTREE-BASE-REF": [P, "folds into VANTA-WORKTREE"],
  "VANTA-WORKTREE-BG-ISOLATION": [P, "folds into VANTA-WORKTREE"],
  "VANTA-WORKTREE-PATH-PARAM": [P, "folds into VANTA-WORKTREE"],
  "VANTA-AUTOUPDATE": [P, "folds into VANTA-AUTO-UPDATER"],
  "VANTA-AUTOUPDATE-UI": [P, "folds into VANTA-AUTO-UPDATER"],
  "VANTA-PKG-MANAGER-UPDATE": [P, "folds into VANTA-AUTO-UPDATER"],
  "VANTA-SKIP-VERSION": [P, "folds into VANTA-AUTO-UPDATER"],
  "VANTA-RELEASE-CHANNELS": [P, "folds into VANTA-AUTO-UPDATER"],
  "VANTA-DISABLE-UPDATES-ENV": [P, "folds into VANTA-AUTO-UPDATER"],
  "VANTA-H-DESKTOP-APP": [P, "duplicate of DESKTOP track"],
  "VANTA-DIRECT-CONNECT-SERVER": [P, "duplicate of DESKTOP-P3 architecture"],
  "VANTA-SHELL-COMPLETION-INSTALL": [P, "already shipped (CLI-DX-PACK completion)"],
  "VANTA-STREAMLINED-OUTPUT": [P, "duplicate of VANTA-JSON-SCHEMA/--bare output modes"],
  "VANTA-MARKETPLACE-AUTO-INSTALL": [P, "duplicate of bundled-skill auto-install (shipped)"],

  // — KEEP → Harness —
  "VANTA-REWIND": "Harness", "VANTA-HOOKS-CMD": "Harness", "VANTA-HOOKS-ENGINE": "Harness",
  "VANTA-SEND-MSG": "Harness", "VANTA-TEAMS": "Harness", "VANTA-MONITOR": "Harness",
  "VANTA-EFFORT": "Harness", "VANTA-BG-AGENTS": "Harness", "VANTA-AUTO-MODE": "Harness",
  "VANTA-BUDGET-CAP": "Harness", "VANTA-JSON-SCHEMA": "Harness", "VANTA-FORK-SESSION": "Harness",
  "VANTA-PURGE": "Harness", "VANTA-SAFE-MODE": "Harness", "VANTA-INIT-FLAGS": "Harness",
  "VANTA-EXEC-BG": "Harness", "VANTA-CACHE-HINTS": "Harness", "VANTA-HOOK-TYPES": "Harness",
  "VANTA-HOOK-EVENTS": "Harness", "VANTA-HOOK-MATCHERS": "Harness", "VANTA-SETTINGS-MEM": "Harness",
  "VANTA-SETTINGS-GIT": "Harness", "VANTA-RULES-FILES": "Harness", "VANTA-MD-IMPORTS": "Harness",
  "VANTA-FROM-PR": "Harness", "VANTA-SESSION-CLEANUP": "Harness", "VANTA-PR-COMMENTS": "Harness",
  "VANTA-PR-STATUS-POLL": "Harness", "VANTA-SWARM-PERM-ROUTING": "Harness", "VANTA-SKILL-LOOP": "Harness",
  "VANTA-MEM-TEAM": "Harness", "VANTA-AGENT-MEMORY": "Harness", "VANTA-COORDINATOR-MODE": "Harness",
  "VANTA-PREVENT-SLEEP": "Harness", "VANTA-CONFIG-TOOL": "Harness", "VANTA-LSP-TOOL-FULL": "Harness",
  "VANTA-TOOL-SEARCH-DEFERRED": "Harness", "VANTA-TOOL-SEARCH-AUTO": "Harness", "VANTA-TASK-TOOLS": "Harness",
  "VANTA-TASKS-CMD": "Harness", "VANTA-CRON-DURABLE": "Harness", "VANTA-HOOK-AGENT-TYPE": "Harness",
  "VANTA-HOOK-PROMPT-TYPE": "Harness", "VANTA-HOOK-FRONTMATTER": "Harness", "VANTA-HOOK-ONCE": "Harness",
  "VANTA-HOOK-EXIT-CODES": "Harness", "VANTA-AUTO-UPDATER": "Harness", "VANTA-MEMORY-WARN": "Harness",
  "VANTA-HOOK-SSRF-GUARD": "Harness", "VANTA-FILE-CHANGED-HOOKS": "Harness",
  "VANTA-TEAMMATE-DEFAULT-MODEL": "Harness", "VANTA-SECURITY-REVIEW-CMD": "Harness",
  "VANTA-CYBER-RISK-INSTRUCTION": "Harness", "VANTA-WORKFLOW-TASK-TYPE": "Harness",
  "VANTA-MONITOR-MCP-TASK": "Harness", "VANTA-BASH-OUTPUT-LIMIT": "Harness",
  "VANTA-READ-ONLY-CMD-MAP": "Harness", "VANTA-SETTINGS-HOT-RELOAD": "Harness",
  "VANTA-CROSS-PROJECT-RESUME": "Harness", "VANTA-BASH-SECURITY-BLOCKS": "Harness",
  "VANTA-FORK-SUBAGENT": "Harness", "VANTA-ACCEPT-EDITS-MODE": "Harness",
  "VANTA-TEAM-SECRET-GUARD": "Harness", "VANTA-WORKTREE": "Harness", "VANTA-SWARM-TMUX": "Harness",
  "VANTA-SWARM-IN-PROCESS": "Harness", "VANTA-SWARM-IDLE-NOTIFY": "Harness",
  "VANTA-PARALLEL-TOOL-EXEC": "Harness", "VANTA-VCR-MODE": "Harness",
  "VANTA-STREAMING-TOOL-EXEC": "Harness", "VANTA-THINKING-ADAPTIVE": "Harness",
  "VANTA-HOOK-TIMING": "Harness", "VANTA-DANGEROUS-PATTERNS": "Harness",
  "VANTA-KEYCHAIN-STORAGE": "Harness", "VANTA-HISTORY-PASTE-STORE": "Harness",
  "VANTA-SCRATCHPAD": "Harness", "VANTA-TREE-SITTER-BASH": "Harness",
  "VANTA-PROMPT-CACHE-BREAK": "Harness", "VANTA-INIT-CMD": "Harness", "VANTA-DESCRIBE-CMD": "Harness",
  "VANTA-STOP-CMD": "Harness", "VANTA-CD-CMD": "Harness", "VANTA-SESSION-ENV": "Harness",
  "VANTA-PRIVACY-LEVELS": "Harness", "VANTA-INTERLEAVED-THINKING": "Harness",
  "VANTA-MODEL-TIER-OVERRIDE": "Harness", "VANTA-CONTEXT-UPGRADE": "Harness",
  "VANTA-API-KEY-HELPER": "Harness", "VANTA-SHADOWED-RULE-DETECT": "Harness",
  "VANTA-BARE-MODE": "Harness", "VANTA-UDS-PEERS": "Harness", "VANTA-TEMPLATES": "Harness",
  "VANTA-VERIFICATION-AGENT": "Harness", "VANTA-REACTIVE-COMPACT": "Harness",
  "VANTA-POST-COMPACT-RESTORE": "Harness", "VANTA-HISTORY-SNIP": "Harness",
  "VANTA-MAGIC-DOCS": "Harness", "VANTA-TOKEN-BUDGET-PARSE": "Harness",
  "VANTA-TOKEN-COUNT-API": "Harness", "VANTA-API-PRECONNECT": "Harness", "VANTA-GOAL-CMD": "Harness",
  "VANTA-HOOK-ADDITIONAL-CTX": "Harness", "VANTA-HOOK-MESSAGE-DISPLAY": "Harness",
  "VANTA-HOOK-PERM-DENIED": "Harness", "VANTA-HOOK-EXEC-FORM": "Harness",
  "VANTA-HOOK-CONTINUE-BLOCK": "Harness", "VANTA-HOOK-SESSION-TITLE": "Harness",
  "VANTA-HOOK-MCP-TOOL-TYPE": "Harness", "VANTA-GREP-READ-EDIT": "Harness",
  "VANTA-LESS-PERMS-SKILL": "Harness", "VANTA-SANDBOX-NETWORK-DENY": "Harness",
  "VANTA-ULTRACODE-TRIGGER": "Harness", "VANTA-BG-FLAG-PRESERVE": "Harness",
  "VANTA-BG-RESPOND-CONTINUE": "Harness", "VANTA-SHELL-SNAPSHOT": "Harness",
  "VANTA-SHELL-STARTUP-WRITE-PROMPT": "Harness", "VANTA-ACCEPTEDITS-HUSKY": "Harness",
  "VANTA-COMMIT-ATTRIBUTION": "Harness", "VANTA-CONCURRENT-SESSIONS": "Harness",
  "VANTA-UNDERCOVER-MODE": "Harness", "VANTA-PROACTIVE-ALIAS": "Harness",
  "VANTA-DEFERRED-SESSION-HOOKS": "Harness", "VANTA-SELF-HOSTED": "Harness",
  "VANTA-WEBFETCH-SKIP": "Harness", "VANTA-SESSION-MEMORY-SVC": "Harness",
  "VANTA-SESSION-MEMORY-COMPACT": "Harness", "VANTA-PLAN-MODE-V2": "Harness",
  "VANTA-BASH-CLASSIFIER": "Harness", "VANTA-DUMP-SYS-PROMPT": "Harness",
  "VANTA-BUILTIN-AGENTS": "Harness", "VANTA-MSG-HOOK-PROGRESS": "Operator",
  "VANTA-SKILL-BATCH": "Harness", "VANTA-LSP-DIAGNOSTIC-PUSH": "Harness",
  "VANTA-STRUCTURED-OUTPUT-TOOL": "Harness",

  // — KEEP → Operator —
  "VANTA-VIM-MODE": "Operator", "VANTA-VIM-OPERATORS": "Operator", "VANTA-VIM-VISUAL-MODE": "Operator",
  "VANTA-VIM-UNDO-REDO": "Operator", "VANTA-SETTINGS-UX": "Operator", "VANTA-AWAY-SUMMARY": "Operator",
  "VANTA-SPINNER-TEAMMATE": "Operator", "VANTA-SPINNER-STALLED": "Operator",
  "VANTA-SPINNER-GLIMMER": "Operator", "VANTA-SPINNER-VERBS": "Operator",
  "VANTA-MSG-PLAN-APPROVAL": "Operator", "VANTA-MSG-TIMESTAMPS": "Operator",
  "VANTA-MSG-SELECTOR": "Operator", "VANTA-BASH-IO-MSGS": "Operator", "VANTA-SHELL-TIMING": "Operator",
  "VANTA-CHANNEL-MSG": "Operator", "VANTA-CONTEXT-VIZ": "Operator", "VANTA-EFFORT-INDICATOR": "Operator",
  "VANTA-AGENT-WIZARD": "Operator", "VANTA-PERM-PER-TOOL-UI": "Operator", "VANTA-SANDBOX-UI": "Operator",
  "VANTA-MCP-PANEL": "Operator", "VANTA-MEMORY-MGMT-UI": "Operator", "VANTA-HOOKS-CONFIG-UI": "Operator",
  "VANTA-BYPASS-DIALOG": "Operator", "VANTA-COST-THRESHOLD-UI": "Operator",
  "VANTA-EXPORT-DIALOG-UI": "Operator", "VANTA-GLOBAL-SEARCH-UI": "Operator",
  "VANTA-MARKDOWN-TABLES": "Operator", "VANTA-MOUSE-SUPPORT": "Operator",
  "VANTA-TEXT-SELECT-TUI": "Operator", "VANTA-TAB-NAV": "Operator", "VANTA-TERMINAL-TITLE": "Operator",
  "VANTA-DESIGN-SYSTEM": "Operator", "VANTA-OUTPUT-STYLE-UI": "Operator",
  "VANTA-OUTPUT-STYLE-DIR": "Operator", "VANTA-SESSION-PREVIEW": "Operator",
  "VANTA-STATUS-NOTICES": "Operator", "VANTA-STRUCTURED-DIFF": "Operator",
  "VANTA-HIGHLIGHTED-CODE": "Operator", "VANTA-THINKING-TOGGLE": "Operator",
  "VANTA-TOOL-LOADER": "Operator", "VANTA-QUICK-OPEN": "Operator", "VANTA-SETTINGS-PANEL": "Operator",
  "VANTA-TASKS-PANEL": "Operator", "VANTA-TEAMS-UI": "Operator", "VANTA-TRUST-DIALOG": "Operator",
  "VANTA-SKILLS-MENU": "Operator", "VANTA-AGENT-DETAIL-UI": "Operator", "VANTA-AGENT-EDITOR": "Operator",
  "VANTA-AGENT-SNAPSHOT": "Operator", "VANTA-ADVISOR-MSG": "Operator", "VANTA-SHUTDOWN-MSG": "Operator",
  "VANTA-AUTO-MODE-OPTIN": "Operator", "VANTA-AUTO-MODE-DENIALS": "Operator",
  "VANTA-WORKFLOW-MULTISELECT": "Operator", "VANTA-KEYBINDING-WARNINGS": "Operator",
  "VANTA-KEYBINDING-SYSTEM": "Operator", "VANTA-CHORD-BINDINGS": "Operator",
  "VANTA-KEYBINDING-CONTEXTS": "Operator", "VANTA-SHORTCUT-DISPLAY": "Operator",
  "VANTA-SEARCH-BOX": "Operator", "VANTA-TRANSCRIPT-SEARCH": "Operator", "VANTA-BIDI-TEXT": "Operator",
  "VANTA-RESOURCE-UPDATE-MSG": "Operator", "VANTA-MCP-RECONNECT-TOGGLE": "Operator",
  "VANTA-MCP-RICH-OUTPUT": "Operator", "VANTA-MCP-MULTISELECT": "Operator",
  "VANTA-MCP-PROJECT-APPROVE": "Operator", "VANTA-SESSION-BACKGROUNDING": "Operator",
  "VANTA-TEAMMATE-COLOR": "Operator", "VANTA-STANDALONE-AGENT-NAME": "Operator",
  "VANTA-AGENT-SUMMARY": "Operator", "VANTA-PROMPT-SUGGEST-UI": "Operator",
  "VANTA-IDLE-RETURN": "Operator", "VANTA-OS-NOTIFY": "Operator", "VANTA-COPY-ON-SELECT": "Operator",
  "VANTA-CLIPBOARD-IMAGE-HINT": "Operator", "VANTA-NATIVE-CLIPBOARD": "Operator",
  "VANTA-HISTORY-PICKER": "Operator", "VANTA-MESSAGE-ACTIONS": "Operator", "VANTA-ASCIICAST": "Operator",
  "VANTA-SCREENSHOT-CLIPBOARD": "Operator", "VANTA-SESSION-TITLE": "Operator", "VANTA-PDF-READ": "Operator",
  "VANTA-VOICE-STT": "Operator", "VANTA-TERMINAL-CAPTURE": "Operator",
  "VANTA-CHANNEL-PERMISSIONS": "Operator", "VANTA-PERMISSION-EXPLAINER": "Operator",
  "VANTA-COST-TRACKER-DETAIL": "Operator", "VANTA-USAGE-MERGED": "Operator", "VANTA-STATS-CMD": "Operator",
  "VANTA-STATS-SPARKLINE": "Operator", "VANTA-STATUS-LINE-GITHUB": "Operator",
  "VANTA-STATUSLINE-RICH": "Operator", "VANTA-TERMINAL-HYPERLINKS": "Operator",
  "VANTA-SHELL-JSON-FORMAT": "Operator", "VANTA-BASH-IMAGE-OUTPUT": "Operator",
  "VANTA-BASH-SHELL-COMPLETION": "Operator", "VANTA-SHELL-HISTORY-COMPLETE": "Operator",
  "VANTA-PATH-COMPLETE": "Operator", "VANTA-FILE-INDEX": "Operator", "VANTA-TYPEAHEAD": "Operator",
  "VANTA-TUI-FULLSCREEN-CMD": "Operator", "VANTA-FOCUS-CMD": "Operator",
  "VANTA-TODO-ACTIVE-FORM": "Operator", "VANTA-EXAMPLE-COMMANDS": "Operator",
  "VANTA-PROJECT-ONBOARDING": "Operator", "VANTA-PROMPT-EDITOR": "Operator",
  "VANTA-AUTO-THEME": "Operator", "VANTA-TERMINAL-SETUP-CMD": "Operator",
  "VANTA-CTRL-U-CLEAR-ALL": "Operator", "VANTA-AGENTIC-SESSION-SEARCH": "Operator",
  "VANTA-MEM-RELEVANCE-LLM": "Operator", "VANTA-EXTRACT-MEMORIES": "Operator",
  "VANTA-AUTO-DREAM-SVC": "Operator", "VANTA-SANDBOX-VIOLATION": "Operator",
  "VANTA-AUTO-ISSUE": "Operator", "VANTA-H-GITHUB": "Operator", "VANTA-H-SLACK": "Operator",
  "VANTA-SLACK-CHANNEL-SUGGEST": "Operator", "VANTA-SSH-SESSION": "Operator",
  "VANTA-SSH-CONFIGS": "Operator", "VANTA-CHROME-GIF-RECORDER": "Operator", "VANTA-DEEP-LINK": "Operator",
  "VANTA-REVIEW-ARTIFACT": "Operator", "VANTA-COPY-CMD": "Operator", "VANTA-ASK-USER-TOOL": "Operator",

  // — KEEP → Solutioning —
  "VANTA-PLAN-INTERVIEW-PHASE": "Solutioning",

  // — KEEP → Extensibility —
  "VANTA-MCP-AUTH": "Extensibility", "VANTA-WAIT-MCP": "Extensibility",
  "VANTA-SETTINGS-MCP": "Extensibility", "VANTA-SETTINGS-SKILL": "Extensibility",
  "VANTA-PLUGIN-URL": "Extensibility", "VANTA-RELOAD-PLUGINS": "Extensibility",
  "VANTA-RELOAD-SKILLS-CMD": "Extensibility", "VANTA-PLUGIN-HINTS": "Extensibility",
  "VANTA-PLUGIN-MARKETPLACE": "Extensibility", "VANTA-PLUGIN-LSP": "Extensibility",
  "VANTA-PLUGIN-DEPS": "Extensibility", "VANTA-PLUGIN-RECOMMEND": "Extensibility",
  "VANTA-PLUGIN-AUTOUPDATE": "Extensibility", "VANTA-PLUGIN-CLI": "Extensibility",
  "VANTA-PLUGIN-MONITORS": "Extensibility", "VANTA-PLUGIN-BIN-EXEC": "Extensibility",
  "VANTA-MCP-ELICITATION": "Extensibility", "VANTA-MCP-OFFICIAL-REGISTRY": "Extensibility",
  "VANTA-MCP-ALWAYS-LOAD": "Extensibility", "VANTA-MCP-DESKTOP-IMPORT": "Extensibility",
  "VANTA-MCP-RESULT-SIZE": "Extensibility", "VANTA-MCP-SKILLS": "Extensibility",
  "VANTA-DXT": "Extensibility", "VANTA-CHICAGO-MCP": "Extensibility", "VANTA-SKILLIFY": "Extensibility",
  "VANTA-SKILL-FILE-ASSETS": "Extensibility", "VANTA-SKILL-ALLOWEDTOOLS": "Extensibility",
  "VANTA-SKILL-CONDITIONAL-ACTIVATE": "Extensibility", "VANTA-SKILL-IMPROVEMENT": "Extensibility",
  "VANTA-SKILL-USAGE-RANK": "Extensibility", "VANTA-RUN-SKILL-GEN": "Extensibility",
  "VANTA-SKILL-OVERRIDE-SETTING": "Extensibility", "VANTA-SKILL-DOLLAR-ESCAPE": "Extensibility",
  "VANTA-AGENTS-DIR": "Extensibility", "VANTA-GENERATE-AGENT": "Extensibility",
  "VANTA-INIT-VERIFIERS": "Extensibility", "VANTA-CLAUDE-CODE-HINTS": "Extensibility",
};

// shipped CC cards: coarse lens → pillar (display-only; collapsed in the board)
const SHIPPED_LENS_MAP = {
  "agent-loop": "Harness", infra: "Harness", coding: "Harness",
  tui: "Operator", cosmetic: "Operator", memory: "Operator",
  reach: "Operator", selfhood: "Operator",
};

const COFOUNDER_SEED = {
  id: "COFOUNDER-ENGINE-SURVEY",
  track: "Cofounder engine",
  title: "Survey: what THEFT/Paperclip needs from Vanta as its operator engine",
  status: "horizon",
  size: "M",
  summary:
    "Read THEFT AI's BUILD-FROM-THIS (SOURCE-OF-TRUTH, PARITY-DELTA, ROADMAP) and Paperclip's runtime contract; produce the card set for Vanta-as-engine: what the company-OS needs (multi-agent departments, heartbeat-style runs, approvals at company scale, skills exchange) that Vanta doesn't yet provide. Engine only — product surfaces stay in the THEFT repo (STRATEGY.md pillar 5).",
  done: "A reviewed list of concrete Vanta cards (or an explicit 'nothing missing') filed under the Cofounder engine track, each traceable to a THEFT need.",
  tier: "rock",
  model: "opus",
  effort: "medium",
  lens: "reach",
  updated: DATE,
};

// ---- run --------------------------------------------------------------------
const r = JSON.parse(readFileSync(PATH, "utf8"));

// 1. dedupe by id (keep first occurrence)
const seen = new Set();
const dups = [];
r.items = r.items.filter((it) => {
  if (seen.has(it.id)) { dups.push(it.id); return false; }
  seen.add(it.id);
  return true;
});

// 2. classify
const parked = []; // {id,title,reason,status,track}
const errors = [];
const kept = [];
for (const it of r.items) {
  const open = it.status !== "shipped";
  if (it.track === "Claude Code parity") {
    if (!open) {
      it.track = SHIPPED_LENS_MAP[it.lens] ?? "Harness";
      kept.push(it);
      continue;
    }
    const d = CC_OPEN[it.id];
    if (d === undefined) { errors.push(`unclassified open CC card: ${it.id}`); continue; }
    if (Array.isArray(d)) { parked.push({ ...it, reason: d[1] }); continue; }
    it.track = d;
    kept.push(it);
  } else {
    if (open && NON_CC_PARK[it.id]) { parked.push({ ...it, reason: NON_CC_PARK[it.id] }); continue; }
    const pillar = NON_CC_OVERRIDES[it.id] ?? TRACK_MAP[it.track];
    if (!pillar) { errors.push(`unmapped track '${it.track}' on ${it.id}`); continue; }
    it.track = pillar;
    kept.push(it);
  }
}
// stale CC_OPEN/NON_CC_PARK entries are fine on re-runs (cards already parked);
// only PRESENT-but-unlisted cards error.
if (errors.length) {
  console.error(`ABORT — ${errors.length} classification errors:\n` + errors.join("\n"));
  process.exit(1);
}

// 3. dependency + seed
const teams = kept.find((i) => i.id === "VANTA-TEAMS");
if (teams && !teams.after) teams.after = ["VANTA-SEND-MSG"];
if (!seen.has(COFOUNDER_SEED.id)) kept.push(COFOUNDER_SEED);

// 4. sort: status → tier → pillar → size → effort → original index
const ord = (m, v, fb) => (v in m ? m[v] : fb);
const S_STATUS = { building: 0, next: 1, horizon: 2, shipped: 3 };
const S_TIER = { rock: 0, pebble: 1, sand: 2 };
const S_PILLAR = Object.fromEntries(PILLARS.map((p, i) => [p, i]));
const S_SIZE = { XS: 0, S: 1, M: 2, L: 3, XL: 4 };
const S_EFFORT = { low: 0, medium: 1, high: 2 };
kept.forEach((it, i) => (it.__i = i));
kept.sort(
  (a, b) =>
    ord(S_STATUS, a.status, 9) - ord(S_STATUS, b.status, 9) ||
    ord(S_TIER, a.tier, 3) - ord(S_TIER, b.tier, 3) ||
    ord(S_PILLAR, a.track, 9) - ord(S_PILLAR, b.track, 9) ||
    ord(S_SIZE, a.size, 5) - ord(S_SIZE, b.size, 5) ||
    ord(S_EFFORT, a.effort, 3) - ord(S_EFFORT, b.effort, 3) ||
    a.__i - b.__i,
);
kept.forEach((it) => delete it.__i);

r.items = kept;
r.updated = DATE;

// 5. report
const count = (f) => kept.filter(f).length;
console.log(`dedup dropped: ${dups.length ? dups.join(", ") : "none"}`);
console.log(`parked: ${parked.length} | kept: ${kept.length}`);
for (const p of PILLARS) {
  const open = count((i) => i.track === p && i.status !== "shipped");
  console.log(`  ${p}: ${open} open / ${count((i) => i.track === p)} total`);
}

// 6. PARKED.md section
const lines = parked
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((p) => `- \`${p.id}\` ${p.title} — ${p.reason}`);
const section = `\n## Roadmap re-org parks (2026-06-11, STRATEGY.md filter)\n${parked.length} open cards parked at the 5-pillar re-track (DECISIONS 2026-06-11): Anthropic cloud/account/enterprise coupling, IDE surfaces, their telemetry, duplicates/folds, post-users polish. Full card bodies recoverable from git history (roadmap.json @ 02959a1). Cost to revisit: re-add via \`roadmap_add\` or restore from git.\n\n${lines.join("\n")}\n`;
writeFileSync("/tmp/parked-section.md", section);
console.log(`parked section → /tmp/parked-section.md (${lines.length} lines)`);

if (DRY) { console.log("DRY RUN — roadmap.json untouched"); process.exit(0); }
writeFileSync(PATH, JSON.stringify(r, null, 2) + "\n");
JSON.parse(readFileSync(PATH, "utf8")); // validate or throw
console.log(`wrote ${PATH} (updated=${DATE})`);
