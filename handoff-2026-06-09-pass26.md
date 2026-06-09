# Handoff — 2026-06-09 — CC Parity Audit Pass 26

## Current State

760 items — 285 shipped · 347 next · 122 horizon  
481 CC parity cards (47 shipped, 334 next, 96 horizon)  
33 new cards added in pass 26  
Last commit: pending

## What Pass 26 Did

Feature flag sweep from reference source (89 flags total). Cross-referenced all against existing roadmap cards. Added 33 genuinely new cards:

**KAIROS cluster (4):**
- CC-KAIROS — Full claude.ai assistant mode (umbrella for brief/proactive/assistant command)
- CC-KAIROS-CHANNELS — --channels flag for MCP push notification subscriptions
- CC-KAIROS-GITHUB — subscribe-pr command + SubscribePRTool for GitHub PR webhooks

**Computer use (1):**
- CC-CHICAGO-MCP — Computer use via MCP server (CHICAGO codename)

**CCR variants (3):**
- CC-CCR-MIRROR — Outbound-only CCR mirror mode
- CC-CCR-AUTO-CONNECT — Auto-connect CCR via GrowthBook gate
- CC-CCR-REMOTE-SETUP — `web`/remote-setup command for CCR onboarding

**Infrastructure (2):**
- CC-FILE-PERSIST — BYOC file persistence between turns
- CC-UPLOAD-SETTINGS — Background settings upload on session start

**UX (3):**
- CC-AUTO-THEME — `auto` theme with OS dark-mode detection
- CC-MESSAGE-ACTIONS — Message actions panel (shift+up keybinding)
- CC-AGENT-SNAPSHOT — Agent memory snapshot update dialog

**Telemetry/observability (6):**
- CC-OTEL-TRACING — OTEL enhanced telemetry beta
- CC-PERFETTO — Perfetto performance trace export
- CC-MEMORY-SHAPE — Memory recall shape telemetry
- CC-SLOW-OP-LOG — Slow operation detection + logging
- CC-CLIENT-ATTEST — Client attestation cch= in User-Agent
- CC-COWORKER-TYPE — coworker_type analytics env var

**API/protocol (3):**
- CC-CONNECTOR-TEXT — Connector text blocks + summarize-connector-text beta
- CC-ANTI-DISTILL — Anti-distillation beta header
- CC-STREAMLINED-OUTPUT — Compact stream-json transformer

**Skills (2):**
- CC-RUN-SKILL-GEN — Skill generator skill
- CC-CLAUDE-API-SKILL — Claude API onboarding skill

**Debug/internal (8):**
- CC-HARD-FAIL — --hard-fail crash mode
- CC-OVERFLOW-TEST — OverflowTestTool
- CC-DUMP-SYS-PROMPT — --dump-system-prompt flag
- CC-ABLATION — Ablation baseline mode
- CC-TEST-VERSIONS — Allow 99.99.x test versions
- CC-SHOT-STATS — Shot distribution in /stats
- CC-COMPACTION-REMIND — compaction_reminder context attachment
- CC-POWERSHELL-AUTO — PowerShell guidance in auto-approve

**Self-hosted / torch (2):**
- CC-SELF-HOSTED — self-hosted-runner entrypoint
- CC-TORCH — /torch command (source not in reference)

## Flags Already Covered (not re-added)

BASH_CLASSIFIER→CC-BASH-CLASSIFIER, BRIDGE_MODE→CC-BRIDGE-CCR, SSH_REMOTE→CC-SSH-SESSION, REVIEW_ARTIFACT→CC-REVIEW-ARTIFACT (already existed), EXTRACT_MEMORIES→CC-EXTRACT-MEMORIES, LODESTONE→CC-DEEP-LINK, KAIROS_DREAM→CC-AUTO-DREAM-SVC, AGENT_TRIGGERS→CC-S-CRON, KAIROS_BRIEF→BRIEF-CMD, PROACTIVE→CC-BRIEF-TOOL, NEW_INIT→CC-INIT-CMD, BREAK_CACHE_COMMAND→CC-PROMPT-CACHE-BREAK, AGENT_TRIGGERS_REMOTE→CC-REMOTE-TRIGGER, UNATTENDED_RETRY→TOOL-RETRY, HOOK_PROMPTS→CC-HOOK-PROMPT-TYPE, BYOC_ENVIRONMENT_RUNNER→CC-BYOC-SETUP, BUILTIN_EXPLORE_PLAN_AGENTS→CC-BUILTIN-AGENTS, WEB_BROWSER_TOOL→CC-BUN-WEBVIEW, UDS_INBOX→CC-UDS-PEERS, WORKFLOW_SCRIPTS→CC-WORKFLOW-TASK-TYPE

## What to Do in Pass 27

**Priority 1 — Unread source directories** (not in compiled reference, need to check build output or alternate path):
- These tools exist in source but weren't readable in the reference: `ReviewArtifactTool/`, `TerminalCaptureTool/`, `ListPeersTool/`, `WorkflowTool/`, `WebBrowserTool/`
- Check: `find reference -name "*.ts" | xargs grep -l "ReviewArtifact\|TerminalCapture\|WebBrowserTool" 2>/dev/null`

**Priority 2 — New commands directory scan** (many commands aren't yet checked):
Look at these commands not yet mapped: `advisor.ts`, `autofix-pr`, `btw`, `bughunter`, `commit.ts`, `commit-push-pr.ts`, `context`, `ctx_viz`, `debug-tool-call`, `effort`, `env`, `extra-usage`, `good-claude`, `heapdump`, `insights.ts`, `issue`, `mock-limits`, `passes`, `perf-issue`, `pr_comments`, `privacy-settings`, `rate-limit-options`, `rewind`, `sandbox-toggle`, `security-review.ts`, `session`, `share`, `stickers`, `summary`, `tag`, `thinkback`, `thinkback-play`, `version.ts`

**Priority 3 — Services directory sweep**:
`src/services/` likely has uncaptured features. Key dirs to check: `extractMemories/`, `settingsSync/`, `policyLimits/`

## Grep to run

```bash
# Find any feature flags not yet in scope
grep -rh "feature('[A-Z_]*')" reference/claude-code-source/src/commands/ | grep -oE "feature\('[A-Z_]+'\)" | sort -u | awk -F"'" '{print $2}'
```
