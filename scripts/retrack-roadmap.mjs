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
  "HP-HOOKS": "duplicate of CC-HOOKS-ENGINE",
};

// ---- OPEN "Claude Code parity" cards: explicit, exhaustive ------------------
const P = "PARK";
const CC_OPEN = {
  // — PARK: Anthropic cloud / account / billing / CCR / claude.ai coupling —
  "CC-H-CLOUD-SESSION": [P, "Anthropic cloud VMs"],
  "CC-H-REMOTE-CONTROL": [P, "claude.ai remote control/teleport"],
  "CC-H-MOBILE": [P, "Anthropic mobile app surface"],
  "CC-H-CLOUD-REVIEW": [P, "Anthropic cloud review product"],
  "CC-H-ACCOUNT": [P, "their account/billing/fun"],
  "CC-H-ENTERPRISE": [P, "their enterprise backends + telemetry"],
  "CC-H-SDK": [P, "their SDK/managed-agents product; PLUGIN-FRAMEWORK covers extensibility"],
  "CC-H-MISC": [P, "vague umbrella card"],
  "CC-REMOTE-TRIGGER": [P, "cloud trigger registry, requires Anthropic OAuth; local cron + webhooks exist"],
  "CC-SETUP-TOKEN": [P, "long-lived OAuth token for their account system"],
  "CC-SESSION-TELEPORT": [P, "cross-device via their cloud"],
  "CC-CLOUD-CREDS": [P, "AWS/GCP cred refresh — enterprise"],
  "CC-MANAGED-POLICY": [P, "org-managed policy — enterprise"],
  "CC-SETTINGS-SYNC": [P, "settings sync via their cloud"],
  "CC-UPLOAD-SETTINGS": [P, "settings upload to their cloud"],
  "CC-REMOTE-MANAGED-SETTINGS": [P, "enterprise org policies via API"],
  "CC-MDM-SETTINGS": [P, "MDM enterprise enforcement"],
  "CC-POLICY-LIMITS": [P, "org admin remote API"],
  "CC-ADMIN-REQUEST": [P, "seat/limit upgrade flows"],
  "CC-MANAGED-PLUGINS": [P, "org plugin policy"],
  "CC-PLUGIN-ONLY-POLICY": [P, "org customization lockdown"],
  "CC-MANAGED-DOMAIN-SECURITY": [P, "managed-domain enforcement"],
  "CC-VERSION-POLICY": [P, "managed version enforcement"],
  "CC-TEAM-MEMORY-SYNC": [P, "org memory sync via their API"],
  "CC-BOOTSTRAP-MODEL-OPTIONS": [P, "server-side model list from their API"],
  "CC-OVERAGE-CREDIT-GRANT": [P, "their billing credits"],
  "CC-MSG-RATE-LIMIT": [P, "tier upsell messaging"],
  "CC-USAGE-CMD": [P, "claude.ai plan usage; Vanta /usage (COST-VISIBLE) exists"],
  "CC-USAGE-UTILIZATION": [P, "their plan rate-limit windows"],
  "CC-EXTRA-USAGE-CMD": [P, "overage provisioning — their billing"],
  "CC-UPGRADE-CMD": [P, "subscription upsell"],
  "CC-PASSES-REFERRAL": [P, "their referral program"],
  "CC-PRIVACY-SETTINGS-CMD": [P, "their data-collection prefs; Vanta is local"],
  "CC-GROVE": [P, "their telemetry consent dialog"],
  "CC-CLIENT-ATTEST": [P, "their first-party auth attestation"],
  "CC-ANTI-DISTILL": [P, "their API beta header"],
  "CC-COWORKER-TYPE": [P, "their analytics env"],
  "CC-MEMORY-SHAPE": [P, "recall telemetry for their analytics"],
  "CC-TEST-VERSIONS": [P, "their internal 99.99.x builds"],
  "CC-DESKTOP-HANDOFF": [P, "downloads their desktop app; Vanta DESKTOP track exists"],
  "CC-DESKTOP-UPSELL": [P, "GrowthBook upsell dialog"],
  "CC-CHROME-EXTENSION-PROMPTS": [P, "Claude-for-Chrome coupling"],
  "CC-CHROME-NATIVE-SETUP": [P, "their Chrome native host"],
  "CC-VOICE-MODE": [P, "their flag-gated /voice; CC-VOICE-STT + VOICE-NATURAL cover it"],
  "CC-FILE-PERSIST": [P, "BYOC cloud session state"],
  "CC-SDK-IDLE-TIMEOUT": [P, "their SDK runtime detail"],
  "CC-AUTO-MODE-GA": [P, "their plan gating of auto mode"],
  "CC-FAST-MODE-IMPL": [P, "their fast-mode product/rate-limit coupling; Vanta has model routing"],
  "CC-TASK-BUDGETS": [P, "their beta header; VANTA_MAX_ITER + CC-BUDGET-CAP cover budgets"],
  "CC-REDACT-THINKING": [P, "their server-side beta"],
  "CC-WORKSPACE-ID-ENV": [P, "scopes their minted OAuth tokens"],
  "CC-SLOW-OP-LOG": [P, "Anthropic-specific hooks"],
  "CC-CONNECTOR-TEXT": [P, "their beta block type"],
  "CC-SHARE-ONBOARDING": [P, "team onboarding product"],
  "CC-TEAMMATE-MODE": [P, "their teammate product UI"],
  "CC-COWORK-MODE": [P, "their collaborative product (XL)"],
  "CC-CLAUDE-API-SKILL": [P, "their API docs content skill"],
  "CC-RELEASE-NOTES-CMD": [P, "their release notes (was in 2026-06-07 excluded list)"],
  "CC-CODE-REVIEW-CMD": [P, "their command-rename trivia"],
  "CC-FEEDBACK-CMD": [P, "reports to their tracker; /bug exists"],
  "CC-FEEDBACK-SURVEY-UI": [P, "their survey pipeline"],
  "CC-STATUS-CMD": [P, "already shipped (/status in REPL)"],
  "CC-BRIDGE-QR": [P, "QR onto a remote bridge Vanta doesn't have; revisit with gateway"],
  "CC-BACKGROUND-REMOTE-SESSION": [P, "CCR background sessions"],
  "CC-BYOC-SETUP": [P, "their BYOC remote setup"],
  "CC-REMOTE-VIEWER": [P, "observe a CCR session"],
  "CC-GIT-REPO-SESSION": [P, "remote sessions in their cloud"],
  "CC-CCR-MIRROR": [P, "mirror to claude.ai"],
  "CC-CCR-AUTO-CONNECT": [P, "GrowthBook-gated CCR autostart"],
  "CC-CCR-REMOTE-SETUP": [P, "CCR onboarding wizard"],
  "CC-REMOTE-CALLOUT": [P, "CCR onboarding dialog"],
  "CC-WEB-SETUP": [P, "their remote web sessions (XL)"],
  "CC-REMOTE-ENV-CMD": [P, "teleport env config"],
  "CC-ULTRAPLAN": [P, "remote CCR planning; local multi-agent planning = CC-PLAN-MODE-V2"],
  "CC-ULTRAPLAN-CMD": [P, "remote CCR planning command"],
  "CC-ULTRAREVIEW-QUOTA": [P, "their quota-tracked cloud review"],
  "CC-ULTRAREVIEW-CLI": [P, "their cloud review from CI"],
  "CC-KAIROS": [P, "claude.ai-integrated assistant mode"],
  "CC-KAIROS-CHANNELS": [P, "their push channel subscriptions"],
  "CC-KAIROS-GITHUB": [P, "their PR webhook product; AUTO-WATCH covers watching"],
  "CC-PUSH-NOTIFY": [P, "mobile push via their Remote Control; Telegram notify exists"],
  "CC-BRIDGE-CCR": [P, "bridge local TUI to their cloud sessions"],
  "CC-FILES-API": [P, "uploads to Anthropic cloud storage"],
  // — PARK: enterprise/infra + their internal test tooling —
  "CC-MTLS-CONFIG": [P, "enterprise proxy TLS"],
  "CC-HTTPS-PROXY": [P, "corporate proxy — post-users"],
  "CC-AWS-BEDROCK-PROVIDER": [P, "DECISIONS 2026-06-09: curated 8 providers; Bedrock = post-v1"],
  "CC-VERTEX-PROVIDER": [P, "DECISIONS 2026-06-09: curated 8 providers"],
  "CC-BEDROCK-WIZARD": [P, "DECISIONS 2026-06-09: curated 8 providers"],
  "CC-VERTEX-WIZARD": [P, "DECISIONS 2026-06-09: curated 8 providers"],
  "CC-OTEL-TRACING": [P, "no observability before users; events.jsonl exists"],
  "CC-OTEL-RAW-BODIES": [P, "no observability before users"],
  "CC-OTEL-ENTRYPOINT": [P, "no observability before users"],
  "CC-OTEL-RESOURCE-ATTRS": [P, "no observability before users"],
  "CC-PERFETTO": [P, "perf tracing — post-users"],
  "CC-TORCH": [P, "their internal benchmarking"],
  "CC-FPS-METRICS": [P, "TUI perf monitoring — revisit if TUI-V2 perf hurts"],
  "CC-HARD-FAIL": [P, "their test-harness mode"],
  "CC-ABLATION": [P, "their internal A/B baseline"],
  "CC-OVERFLOW-TEST": [P, "synthetic overflow tool — build when testing compaction"],
  // — PARK: IDE / other-platform surfaces —
  "CC-H-BROWSER-IDE": [P, "IDE-plugin class excluded (PARKED 2026-06-07)"],
  "CC-IDE-DIFF": [P, "IDE integration"],
  "CC-IDE-AUTO-CONNECT": [P, "IDE integration"],
  "CC-JETBRAINS": [P, "IDE integration"],
  "CC-WRITE-IDE-DIFF": [P, "IDE integration"],
  "CC-PROMPT-SUGGEST": [P, "IDE/shell emit variant; CC-PROMPT-SUGGEST-UI keeps the in-TUI version"],
  "CC-POWERSHELL": [P, "Windows — macOS-first for now"],
  "CC-POWERSHELL-AUTO": [P, "Windows — macOS-first for now"],
  "CC-PERFORCE-MODE": [P, "Perforce — niche VCS"],
  "CC-CEDAR-SYNTAX": [P, "AWS Cedar highlighting — niche"],
  "CC-NOTEBOOK": [P, "Jupyter — no demand yet"],
  "CC-BUN-WEBVIEW": [P, "embedded browser panel — browser tools + DESKTOP cover it"],
  "CC-APPLE-TERMINAL-BACKUP": [P, "terminal-specific recovery; sessions/resume exist"],
  "CC-FIG-CMD-SPECS": [P, "withfig spec dependency — niche"],
  "CC-SWARM-IT2-SETUP": [P, "iTerm2 Python API backend; CC-SWARM-TMUX is the one mux backend"],
  // — PARK: rule-zero conflict —
  "CC-SPECULATION-ENGINE": [P, "pre-executes predicted commands — conflicts rule zero (approval-first)"],
  // — PARK: cosmetic / post-users —
  "CC-THINKBACK": [P, "year-in-review animation — post-users"],
  "CC-BUDDY": [P, "ASCII pet — post-users"],
  "CC-LOGO-ANIMATED": [P, "startup animation + feed — post-users"],
  "CC-COLOR-PROMPT": [P, "/color was in the 2026-06-07 excluded list"],
  "CC-COLOR-RANDOM": [P, "/color trivia"],
  "CC-SED-EDIT-RENDER": [P, "niche render nicety"],
  "CC-SHOT-STATS": [P, "niche analytics histogram"],
  // — PARK: duplicates / folds (keeper noted) —
  "CC-SEND-MESSAGE-TOOL": [P, "duplicate of CC-SEND-MSG"],
  "CC-TEAM-TOOLS": [P, "duplicate of CC-TEAMS"],
  "CC-H-AGENT-TEAMS": [P, "umbrella duplicate of CC-TEAMS cluster"],
  "CC-HOOKS": [P, "duplicate of CC-HOOKS-ENGINE"],
  "CC-MCP-AUTH-TOOL": [P, "duplicate of CC-MCP-AUTH"],
  "CC-AWAY-RECAP": [P, "duplicate of CC-AWAY-SUMMARY"],
  "CC-MEMORY-MONITOR": [P, "duplicate of CC-MEMORY-WARN"],
  "CC-SWARM-PERM-SYNC": [P, "duplicate of CC-SWARM-PERM-ROUTING"],
  "CC-BG-SESSION-CMDS": [P, "duplicate of CC-BG-AGENTS"],
  "CC-BASH-PARSER-TS": [P, "alternative to CC-TREE-SITTER-BASH (keep one parser)"],
  "CC-CLI-HIGHLIGHT": [P, "duplicate of CC-HIGHLIGHTED-CODE"],
  "CC-QUICK-SEARCH": [P, "duplicate of CC-SEARCH-BOX"],
  "CC-ANSI-PNG": [P, "folds into CC-SCREENSHOT-CLIPBOARD"],
  "CC-FILE-HISTORY-SNAP": [P, "folds into CC-REWIND (its mechanism)"],
  "CC-TURN-DIFFS": [P, "folds into CC-REWIND"],
  "CC-TMUX": [P, "folds into CC-WORKTREE"],
  "CC-WORKTREE-EXIT-DIALOG": [P, "folds into CC-WORKTREE"],
  "CC-WORKTREE-BASE-REF": [P, "folds into CC-WORKTREE"],
  "CC-WORKTREE-BG-ISOLATION": [P, "folds into CC-WORKTREE"],
  "CC-WORKTREE-PATH-PARAM": [P, "folds into CC-WORKTREE"],
  "CC-AUTOUPDATE": [P, "folds into CC-AUTO-UPDATER"],
  "CC-AUTOUPDATE-UI": [P, "folds into CC-AUTO-UPDATER"],
  "CC-PKG-MANAGER-UPDATE": [P, "folds into CC-AUTO-UPDATER"],
  "CC-SKIP-VERSION": [P, "folds into CC-AUTO-UPDATER"],
  "CC-RELEASE-CHANNELS": [P, "folds into CC-AUTO-UPDATER"],
  "CC-DISABLE-UPDATES-ENV": [P, "folds into CC-AUTO-UPDATER"],
  "CC-H-DESKTOP-APP": [P, "duplicate of DESKTOP track"],
  "CC-DIRECT-CONNECT-SERVER": [P, "duplicate of DESKTOP-P3 architecture"],
  "CC-SHELL-COMPLETION-INSTALL": [P, "already shipped (CLI-DX-PACK completion)"],
  "CC-STREAMLINED-OUTPUT": [P, "duplicate of CC-JSON-SCHEMA/--bare output modes"],
  "CC-MARKETPLACE-AUTO-INSTALL": [P, "duplicate of bundled-skill auto-install (shipped)"],

  // — KEEP → Harness —
  "CC-REWIND": "Harness", "CC-HOOKS-CMD": "Harness", "CC-HOOKS-ENGINE": "Harness",
  "CC-SEND-MSG": "Harness", "CC-TEAMS": "Harness", "CC-MONITOR": "Harness",
  "CC-EFFORT": "Harness", "CC-BG-AGENTS": "Harness", "CC-AUTO-MODE": "Harness",
  "CC-BUDGET-CAP": "Harness", "CC-JSON-SCHEMA": "Harness", "CC-FORK-SESSION": "Harness",
  "CC-PURGE": "Harness", "CC-SAFE-MODE": "Harness", "CC-INIT-FLAGS": "Harness",
  "CC-EXEC-BG": "Harness", "CC-CACHE-HINTS": "Harness", "CC-HOOK-TYPES": "Harness",
  "CC-HOOK-EVENTS": "Harness", "CC-HOOK-MATCHERS": "Harness", "CC-SETTINGS-MEM": "Harness",
  "CC-SETTINGS-GIT": "Harness", "CC-RULES-FILES": "Harness", "CC-MD-IMPORTS": "Harness",
  "CC-FROM-PR": "Harness", "CC-SESSION-CLEANUP": "Harness", "CC-PR-COMMENTS": "Harness",
  "CC-PR-STATUS-POLL": "Harness", "CC-SWARM-PERM-ROUTING": "Harness", "CC-SKILL-LOOP": "Harness",
  "CC-MEM-TEAM": "Harness", "CC-AGENT-MEMORY": "Harness", "CC-COORDINATOR-MODE": "Harness",
  "CC-PREVENT-SLEEP": "Harness", "CC-CONFIG-TOOL": "Harness", "CC-LSP-TOOL-FULL": "Harness",
  "CC-TOOL-SEARCH-DEFERRED": "Harness", "CC-TOOL-SEARCH-AUTO": "Harness", "CC-TASK-TOOLS": "Harness",
  "CC-TASKS-CMD": "Harness", "CC-CRON-DURABLE": "Harness", "CC-HOOK-AGENT-TYPE": "Harness",
  "CC-HOOK-PROMPT-TYPE": "Harness", "CC-HOOK-FRONTMATTER": "Harness", "CC-HOOK-ONCE": "Harness",
  "CC-HOOK-EXIT-CODES": "Harness", "CC-AUTO-UPDATER": "Harness", "CC-MEMORY-WARN": "Harness",
  "CC-HOOK-SSRF-GUARD": "Harness", "CC-FILE-CHANGED-HOOKS": "Harness",
  "CC-TEAMMATE-DEFAULT-MODEL": "Harness", "CC-SECURITY-REVIEW-CMD": "Harness",
  "CC-CYBER-RISK-INSTRUCTION": "Harness", "CC-WORKFLOW-TASK-TYPE": "Harness",
  "CC-MONITOR-MCP-TASK": "Harness", "CC-BASH-OUTPUT-LIMIT": "Harness",
  "CC-READ-ONLY-CMD-MAP": "Harness", "CC-SETTINGS-HOT-RELOAD": "Harness",
  "CC-CROSS-PROJECT-RESUME": "Harness", "CC-BASH-SECURITY-BLOCKS": "Harness",
  "CC-FORK-SUBAGENT": "Harness", "CC-ACCEPT-EDITS-MODE": "Harness",
  "CC-TEAM-SECRET-GUARD": "Harness", "CC-WORKTREE": "Harness", "CC-SWARM-TMUX": "Harness",
  "CC-SWARM-IN-PROCESS": "Harness", "CC-SWARM-IDLE-NOTIFY": "Harness",
  "CC-PARALLEL-TOOL-EXEC": "Harness", "CC-VCR-MODE": "Harness",
  "CC-STREAMING-TOOL-EXEC": "Harness", "CC-THINKING-ADAPTIVE": "Harness",
  "CC-HOOK-TIMING": "Harness", "CC-DANGEROUS-PATTERNS": "Harness",
  "CC-KEYCHAIN-STORAGE": "Harness", "CC-HISTORY-PASTE-STORE": "Harness",
  "CC-SCRATCHPAD": "Harness", "CC-TREE-SITTER-BASH": "Harness",
  "CC-PROMPT-CACHE-BREAK": "Harness", "CC-INIT-CMD": "Harness", "CC-DESCRIBE-CMD": "Harness",
  "CC-STOP-CMD": "Harness", "CC-CD-CMD": "Harness", "CC-SESSION-ENV": "Harness",
  "CC-PRIVACY-LEVELS": "Harness", "CC-INTERLEAVED-THINKING": "Harness",
  "CC-MODEL-TIER-OVERRIDE": "Harness", "CC-CONTEXT-UPGRADE": "Harness",
  "CC-API-KEY-HELPER": "Harness", "CC-SHADOWED-RULE-DETECT": "Harness",
  "CC-BARE-MODE": "Harness", "CC-UDS-PEERS": "Harness", "CC-TEMPLATES": "Harness",
  "CC-VERIFICATION-AGENT": "Harness", "CC-REACTIVE-COMPACT": "Harness",
  "CC-POST-COMPACT-RESTORE": "Harness", "CC-HISTORY-SNIP": "Harness",
  "CC-MAGIC-DOCS": "Harness", "CC-TOKEN-BUDGET-PARSE": "Harness",
  "CC-TOKEN-COUNT-API": "Harness", "CC-API-PRECONNECT": "Harness", "CC-GOAL-CMD": "Harness",
  "CC-HOOK-ADDITIONAL-CTX": "Harness", "CC-HOOK-MESSAGE-DISPLAY": "Harness",
  "CC-HOOK-PERM-DENIED": "Harness", "CC-HOOK-EXEC-FORM": "Harness",
  "CC-HOOK-CONTINUE-BLOCK": "Harness", "CC-HOOK-SESSION-TITLE": "Harness",
  "CC-HOOK-MCP-TOOL-TYPE": "Harness", "CC-GREP-READ-EDIT": "Harness",
  "CC-LESS-PERMS-SKILL": "Harness", "CC-SANDBOX-NETWORK-DENY": "Harness",
  "CC-ULTRACODE-TRIGGER": "Harness", "CC-BG-FLAG-PRESERVE": "Harness",
  "CC-BG-RESPOND-CONTINUE": "Harness", "CC-SHELL-SNAPSHOT": "Harness",
  "CC-SHELL-STARTUP-WRITE-PROMPT": "Harness", "CC-ACCEPTEDITS-HUSKY": "Harness",
  "CC-COMMIT-ATTRIBUTION": "Harness", "CC-CONCURRENT-SESSIONS": "Harness",
  "CC-UNDERCOVER-MODE": "Harness", "CC-PROACTIVE-ALIAS": "Harness",
  "CC-DEFERRED-SESSION-HOOKS": "Harness", "CC-SELF-HOSTED": "Harness",
  "CC-WEBFETCH-SKIP": "Harness", "CC-SESSION-MEMORY-SVC": "Harness",
  "CC-SESSION-MEMORY-COMPACT": "Harness", "CC-PLAN-MODE-V2": "Harness",
  "CC-BASH-CLASSIFIER": "Harness", "CC-DUMP-SYS-PROMPT": "Harness",
  "CC-BUILTIN-AGENTS": "Harness", "CC-MSG-HOOK-PROGRESS": "Operator",
  "CC-SKILL-BATCH": "Harness", "CC-LSP-DIAGNOSTIC-PUSH": "Harness",
  "CC-STRUCTURED-OUTPUT-TOOL": "Harness",

  // — KEEP → Operator —
  "CC-VIM-MODE": "Operator", "CC-VIM-OPERATORS": "Operator", "CC-VIM-VISUAL-MODE": "Operator",
  "CC-VIM-UNDO-REDO": "Operator", "CC-SETTINGS-UX": "Operator", "CC-AWAY-SUMMARY": "Operator",
  "CC-SPINNER-TEAMMATE": "Operator", "CC-SPINNER-STALLED": "Operator",
  "CC-SPINNER-GLIMMER": "Operator", "CC-SPINNER-VERBS": "Operator",
  "CC-MSG-PLAN-APPROVAL": "Operator", "CC-MSG-TIMESTAMPS": "Operator",
  "CC-MSG-SELECTOR": "Operator", "CC-BASH-IO-MSGS": "Operator", "CC-SHELL-TIMING": "Operator",
  "CC-CHANNEL-MSG": "Operator", "CC-CONTEXT-VIZ": "Operator", "CC-EFFORT-INDICATOR": "Operator",
  "CC-AGENT-WIZARD": "Operator", "CC-PERM-PER-TOOL-UI": "Operator", "CC-SANDBOX-UI": "Operator",
  "CC-MCP-PANEL": "Operator", "CC-MEMORY-MGMT-UI": "Operator", "CC-HOOKS-CONFIG-UI": "Operator",
  "CC-BYPASS-DIALOG": "Operator", "CC-COST-THRESHOLD-UI": "Operator",
  "CC-EXPORT-DIALOG-UI": "Operator", "CC-GLOBAL-SEARCH-UI": "Operator",
  "CC-MARKDOWN-TABLES": "Operator", "CC-MOUSE-SUPPORT": "Operator",
  "CC-TEXT-SELECT-TUI": "Operator", "CC-TAB-NAV": "Operator", "CC-TERMINAL-TITLE": "Operator",
  "CC-DESIGN-SYSTEM": "Operator", "CC-OUTPUT-STYLE-UI": "Operator",
  "CC-OUTPUT-STYLE-DIR": "Operator", "CC-SESSION-PREVIEW": "Operator",
  "CC-STATUS-NOTICES": "Operator", "CC-STRUCTURED-DIFF": "Operator",
  "CC-HIGHLIGHTED-CODE": "Operator", "CC-THINKING-TOGGLE": "Operator",
  "CC-TOOL-LOADER": "Operator", "CC-QUICK-OPEN": "Operator", "CC-SETTINGS-PANEL": "Operator",
  "CC-TASKS-PANEL": "Operator", "CC-TEAMS-UI": "Operator", "CC-TRUST-DIALOG": "Operator",
  "CC-SKILLS-MENU": "Operator", "CC-AGENT-DETAIL-UI": "Operator", "CC-AGENT-EDITOR": "Operator",
  "CC-AGENT-SNAPSHOT": "Operator", "CC-ADVISOR-MSG": "Operator", "CC-SHUTDOWN-MSG": "Operator",
  "CC-AUTO-MODE-OPTIN": "Operator", "CC-AUTO-MODE-DENIALS": "Operator",
  "CC-WORKFLOW-MULTISELECT": "Operator", "CC-KEYBINDING-WARNINGS": "Operator",
  "CC-KEYBINDING-SYSTEM": "Operator", "CC-CHORD-BINDINGS": "Operator",
  "CC-KEYBINDING-CONTEXTS": "Operator", "CC-SHORTCUT-DISPLAY": "Operator",
  "CC-SEARCH-BOX": "Operator", "CC-TRANSCRIPT-SEARCH": "Operator", "CC-BIDI-TEXT": "Operator",
  "CC-RESOURCE-UPDATE-MSG": "Operator", "CC-MCP-RECONNECT-TOGGLE": "Operator",
  "CC-MCP-RICH-OUTPUT": "Operator", "CC-MCP-MULTISELECT": "Operator",
  "CC-MCP-PROJECT-APPROVE": "Operator", "CC-SESSION-BACKGROUNDING": "Operator",
  "CC-TEAMMATE-COLOR": "Operator", "CC-STANDALONE-AGENT-NAME": "Operator",
  "CC-AGENT-SUMMARY": "Operator", "CC-PROMPT-SUGGEST-UI": "Operator",
  "CC-IDLE-RETURN": "Operator", "CC-OS-NOTIFY": "Operator", "CC-COPY-ON-SELECT": "Operator",
  "CC-CLIPBOARD-IMAGE-HINT": "Operator", "CC-NATIVE-CLIPBOARD": "Operator",
  "CC-HISTORY-PICKER": "Operator", "CC-MESSAGE-ACTIONS": "Operator", "CC-ASCIICAST": "Operator",
  "CC-SCREENSHOT-CLIPBOARD": "Operator", "CC-SESSION-TITLE": "Operator", "CC-PDF-READ": "Operator",
  "CC-VOICE-STT": "Operator", "CC-TERMINAL-CAPTURE": "Operator",
  "CC-CHANNEL-PERMISSIONS": "Operator", "CC-PERMISSION-EXPLAINER": "Operator",
  "CC-COST-TRACKER-DETAIL": "Operator", "CC-USAGE-MERGED": "Operator", "CC-STATS-CMD": "Operator",
  "CC-STATS-SPARKLINE": "Operator", "CC-STATUS-LINE-GITHUB": "Operator",
  "CC-STATUSLINE-RICH": "Operator", "CC-TERMINAL-HYPERLINKS": "Operator",
  "CC-SHELL-JSON-FORMAT": "Operator", "CC-BASH-IMAGE-OUTPUT": "Operator",
  "CC-BASH-SHELL-COMPLETION": "Operator", "CC-SHELL-HISTORY-COMPLETE": "Operator",
  "CC-PATH-COMPLETE": "Operator", "CC-FILE-INDEX": "Operator", "CC-TYPEAHEAD": "Operator",
  "CC-TUI-FULLSCREEN-CMD": "Operator", "CC-FOCUS-CMD": "Operator",
  "CC-TODO-ACTIVE-FORM": "Operator", "CC-EXAMPLE-COMMANDS": "Operator",
  "CC-PROJECT-ONBOARDING": "Operator", "CC-PROMPT-EDITOR": "Operator",
  "CC-AUTO-THEME": "Operator", "CC-TERMINAL-SETUP-CMD": "Operator",
  "CC-CTRL-U-CLEAR-ALL": "Operator", "CC-AGENTIC-SESSION-SEARCH": "Operator",
  "CC-MEM-RELEVANCE-LLM": "Operator", "CC-EXTRACT-MEMORIES": "Operator",
  "CC-AUTO-DREAM-SVC": "Operator", "CC-SANDBOX-VIOLATION": "Operator",
  "CC-AUTO-ISSUE": "Operator", "CC-H-GITHUB": "Operator", "CC-H-SLACK": "Operator",
  "CC-SLACK-CHANNEL-SUGGEST": "Operator", "CC-SSH-SESSION": "Operator",
  "CC-SSH-CONFIGS": "Operator", "CC-CHROME-GIF-RECORDER": "Operator", "CC-DEEP-LINK": "Operator",
  "CC-REVIEW-ARTIFACT": "Operator", "CC-COPY-CMD": "Operator", "CC-ASK-USER-TOOL": "Operator",

  // — KEEP → Solutioning —
  "CC-PLAN-INTERVIEW-PHASE": "Solutioning",

  // — KEEP → Extensibility —
  "CC-MCP-AUTH": "Extensibility", "CC-WAIT-MCP": "Extensibility",
  "CC-SETTINGS-MCP": "Extensibility", "CC-SETTINGS-SKILL": "Extensibility",
  "CC-PLUGIN-URL": "Extensibility", "CC-RELOAD-PLUGINS": "Extensibility",
  "CC-RELOAD-SKILLS-CMD": "Extensibility", "CC-PLUGIN-HINTS": "Extensibility",
  "CC-PLUGIN-MARKETPLACE": "Extensibility", "CC-PLUGIN-LSP": "Extensibility",
  "CC-PLUGIN-DEPS": "Extensibility", "CC-PLUGIN-RECOMMEND": "Extensibility",
  "CC-PLUGIN-AUTOUPDATE": "Extensibility", "CC-PLUGIN-CLI": "Extensibility",
  "CC-PLUGIN-MONITORS": "Extensibility", "CC-PLUGIN-BIN-EXEC": "Extensibility",
  "CC-MCP-ELICITATION": "Extensibility", "CC-MCP-OFFICIAL-REGISTRY": "Extensibility",
  "CC-MCP-ALWAYS-LOAD": "Extensibility", "CC-MCP-DESKTOP-IMPORT": "Extensibility",
  "CC-MCP-RESULT-SIZE": "Extensibility", "CC-MCP-SKILLS": "Extensibility",
  "CC-DXT": "Extensibility", "CC-CHICAGO-MCP": "Extensibility", "CC-SKILLIFY": "Extensibility",
  "CC-SKILL-FILE-ASSETS": "Extensibility", "CC-SKILL-ALLOWEDTOOLS": "Extensibility",
  "CC-SKILL-CONDITIONAL-ACTIVATE": "Extensibility", "CC-SKILL-IMPROVEMENT": "Extensibility",
  "CC-SKILL-USAGE-RANK": "Extensibility", "CC-RUN-SKILL-GEN": "Extensibility",
  "CC-SKILL-OVERRIDE-SETTING": "Extensibility", "CC-SKILL-DOLLAR-ESCAPE": "Extensibility",
  "CC-AGENTS-DIR": "Extensibility", "CC-GENERATE-AGENT": "Extensibility",
  "CC-INIT-VERIFIERS": "Extensibility", "CC-CLAUDE-CODE-HINTS": "Extensibility",
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
const teams = kept.find((i) => i.id === "CC-TEAMS");
if (teams && !teams.after) teams.after = ["CC-SEND-MSG"];
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
