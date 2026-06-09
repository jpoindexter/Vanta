# Handoff — CC Parity Audit (Ongoing) — Pass 26 Continuation
Generated: 2026-06-09 22:55
Project: Vanta — /Users/jasonpoindexter/Documents/GitHub/_active/Vanta
Branch: main

## What Was Accomplished This Session

Multi-pass audit of the CC source reference at `reference/claude-code-source/src/` reading every directory, file, and feature flag. Added **255 new roadmap cards** across 25 passes (started at ~474 items, now at **727 items**).

Key technique discovered in pass 24-25: **feature flag sweeping** — scanning all `feature('FLAG')` calls across the codebase surfaces hidden gated capabilities that file-by-file reading misses. This reset the stopping clock twice after we thought the source was exhausted.

## Current State

- **Roadmap**: 727 items — 285 shipped · 321 next · 115 horizon · 6 done
- **CC parity cards**: 448 total (47 shipped, 308 next, 89 horizon)
- **Last commit**: `68435e6` — pass 25 tracker update
- **All committed and pushed** to `https://github.com/jpoindexter/Vanta.git` (main)
- **Uncommitted M files**: `.gitignore`, `DECISIONS.md`, `PARKED.md`, `docs-site/index.html`, `docs/feature-map.html`, `docs/superpowers/specs/`, `vanta-ts/scripts/build-audit.mjs` — these are pre-existing edits from much earlier, NOT from this session. Safe to ignore.

## In Progress — Pass 26 Pending

### Stopping condition
3 consecutive passes finding ≤2 new cards. Current streak: **0 of 3** (pass 25 found 12, clock reset).

### What remains to sweep

**1. Feature flag sweep — remaining uncaptured flags**

From the full flag inventory, these are NOT yet captured as cards:
- `CACHED_MICROCOMPACT` — cached microcompaction pending edits in query.ts
- `FILE_PERSISTENCE` — per-turn file output tracking (filePersistence.ts)
- `CCR_AUTO_CONNECT` — bridge auto-connect on startup
- `SHOT_STATS` — shot distribution stats in /stats
- `CONNECTOR_TEXT` — summarize connector text beta
- `POWERSHELL_AUTO_MODE` — PowerShell in auto mode/classifier
- `DOWNLOAD_USER_SETTINGS` — download settings at session start
- `ENHANCED_TELEMETRY_BETA` — telemetry (probably skip, not user-visible)

Run this to find ALL remaining uncaptured flags:
```bash
grep -rh "feature('\([A-Z_]*\)')" \
  /Users/jasonpoindexter/Documents/GitHub/_active/Vanta/reference/claude-code-source/src/ \
  2>/dev/null | \
  grep -oE "feature\('[A-Z_]+'\)" | \
  sort | uniq -c | sort -rn | \
  awk '{print $2}' | grep -oE "'[A-Z_]+'" | tr -d "'"
```

Then cross-reference against roadmap:
```python
python3 -c "
import json
data = json.load(open('roadmap.json'))
flags = ['FLAG1', 'FLAG2']  # replace with flags from above
for flag in flags:
    slug = flag.lower().replace('_', '-')
    matches = [i['id'] for i in data['items'] if slug.upper() in i['id'].upper() or flag.upper() in i.get('summary','').upper()]
    if not matches:
        print(f'NOT FOUND: {flag}')
"
```

**2. Remaining high-value unread files**

- `src/cli/print.ts` (5594 lines) — the non-interactive SDK output handler, partially scanned; may have more SDK output modes
- `utils/hooks.ts` (5022 lines) — `executeCwdChangedHooks`, hook aggregation; CwdChanged hook event
- `utils/messages.ts` (5512 lines) — massive messages utility; many message type constructors
- `utils/sessionStorage.ts` (5105 lines) — session storage with `AgentMetadata`, `RemoteAgentMetadata`
- `services/api/claude.ts` (3419 lines) — main API client; may have query configuration options
- `bridge/bridgeMain.ts` (2999 lines) — main bridge logic; may have bridge reconnect strategies
- `services/mcp/client.ts` (3348 lines) — MCP client; connection pooling, auth modes

**3. Commands I never confirmed reading**
Run to find any command dirs not yet documented:
```bash
ls /Users/jasonpoindexter/Documents/GitHub/_active/Vanta/reference/claude-code-source/src/commands/
```
Check especially: `review/`, `session/`, `share/`, `summary/` — those may be unread.

**4. tools/ directories not yet read**
```bash
ls /Users/jasonpoindexter/Documents/GitHub/_active/Vanta/reference/claude-code-source/src/tools/ 
```
Unread: `ReviewArtifactTool/`, `TerminalCaptureTool/`, `WorkflowTool/`, `WebBrowserTool/`, `ListPeersTool/`

## Key Decisions Made

1. **Audit technique**: File-by-file reading + feature flag sweep. The flag sweep is essential — scan `feature('FLAG')` across entire codebase to find hidden capabilities.
2. **Stopping rule**: 3 consecutive passes with ≤2 new cards. Has been reset twice by spikes.
3. **Card schema**: every card needs `id`, `track`, `title`, `status`, `size`, `summary`, `done`, `tier`, `model`, `effort`, `updated`. `tier`: rock/pebble/sand. Track for CC parity: `"Claude Code parity"`.
4. **Roadmap build**: run from repo root: `./vanta-ts/node_modules/.bin/tsx --tsconfig vanta-ts/tsconfig.json vanta-ts/src/cli.ts roadmap build`
5. **Always commit explicitly**: `git add roadmap.json vanta-ts/CC_AUDIT_TRACKER.md && git commit -m "feat(roadmap): p26... "` — never include the pre-existing M files.

## Exact Next Steps (in order)

1. [ ] **Feature flag sweep** — run the grep above, get full flag list, cross-reference against roadmap, add missing cards
2. [ ] Read `tools/ReviewArtifactTool/`, `tools/TerminalCaptureTool/`, `tools/ListPeersTool/`, `tools/WorkflowTool/` for their full feature details
3. [ ] Scan `cli/print.ts` for SDK output modes (`--output-format`, `--input-format`, streaming JSON)
4. [ ] Scan `utils/hooks.ts` for any remaining hook types
5. [ ] Check `commands/review/`, `commands/session/`, `commands/share/`, `commands/summary/` if they exist
6. [ ] Run roadmap build and commit each batch with `git push origin main`
7. [ ] Update `vanta-ts/CC_AUDIT_TRACKER.md` pass history
8. [ ] Continue until 3 consecutive passes ≤2 cards

## Context That's Easy to Lose

- **CC source location**: `reference/claude-code-source/src/` (gitignored local archive)
- **roadmap.json uses `"items"` key** (not `"cards"`). All new cards need: `id`, `track`, `title`, `status`, `size`, `summary`, `done`, `tier`, `model`, `effort`, `updated`.
- **tier values**: `rock | pebble | sand` (NOT `ore`)
- **Status values**: `shipped | building | next | horizon`
- **Track for all CC parity cards**: `"Claude Code parity"`
- **Feature flag spikes keep happening** — every time the source seems exhausted, a new sweep of `feature()` calls finds more. Do the full grep before declaring done.
- **Pre-existing M files** in git status (`.gitignore`, `DECISIONS.md`, etc.) are from sessions months ago — do NOT include in commits.
- **Roadmap HTML is gitignored** — it regenerates from JSON, no need to commit it.
- **Cross-reference pattern**: `python3 -c "import json; data=json.load(open('roadmap.json')); print([i['id'] for i in data['items'] if 'KEYWORD' in i['id'].upper()])"`

## Pass 26 Continuation Prompt

Paste this into a new Claude session to resume:

---

I'm continuing the CC parity audit hill-climb for the Vanta project at `/Users/jasonpoindexter/Documents/GitHub/_active/Vanta`.

**Background**: We've been reading every file in the CC source reference (`reference/claude-code-source/src/`) and adding roadmap cards for features Vanta is missing. The audit has run 25 passes. **727 items** in roadmap (285 shipped · 321 next · 115 horizon), **448 CC parity cards**. All committed to main.

**Tracker file**: `vanta-ts/CC_AUDIT_TRACKER.md` — full pass history and coverage map.

**Current stopping condition status**: Clock RESET (pass 25 found 12 cards). Need 3 consecutive passes ≤2 to stop.

**Most effective technique discovered**: Feature flag sweep. Run this first:
```bash
grep -rh "feature('[A-Z_]*')" \
  /Users/jasonpoindexter/Documents/GitHub/_active/Vanta/reference/claude-code-source/src/ \
  2>/dev/null | \
  grep -oE "feature\('[A-Z_]+'\)" | \
  sort | uniq -c | sort -rn | \
  awk '{print $2}' | grep -oE "'[A-Z_]+'" | tr -d "'"
```

Then cross-reference against roadmap to find uncaptured flags:
```bash
python3 -c "
import json
data = json.load(open('roadmap.json'))
# paste flag list here
flags = ['CACHED_MICROCOMPACT', 'FILE_PERSISTENCE', 'CCR_AUTO_CONNECT', 'SHOT_STATS', 'CONNECTOR_TEXT', 'POWERSHELL_AUTO_MODE', 'DOWNLOAD_USER_SETTINGS']
for flag in flags:
    slug = flag.lower().replace('_', '-')
    matches = [i['id'] for i in data['items'] if slug.upper() in i['id'].upper() or flag.upper() in i.get('summary','').upper()]
    if not matches:
        print(f'NOT FOUND: {flag}')
"
```

**Also read these unread tool directories**:
- `tools/ReviewArtifactTool/` — full artifact review UI
- `tools/TerminalCaptureTool/` — terminal content capture
- `tools/ListPeersTool/` — peer agent listing
- `tools/WorkflowTool/` — workflow script execution tool
- `tools/WebBrowserTool/` — native Bun WebView browser tool

**And these large files with likely remaining features**:
- `cli/print.ts` (5594 lines) — SDK output modes
- `utils/hooks.ts` (5022 lines) — hook aggregation
- `services/api/claude.ts` (3419 lines) — API client options

**Card schema** (every field required):
```json
{
  "id": "CC-FEATURE-NAME",
  "track": "Claude Code parity",
  "title": "Short description",
  "status": "next",
  "size": "S",
  "summary": "What CC does...",
  "done": "Done criteria...",
  "tier": "sand",
  "model": "sonnet",
  "effort": "low",
  "updated": "2026-06-09"
}
```
- `tier`: `rock | pebble | sand`
- `status`: `next` (implementable) or `horizon` (complex/cloud)
- `track`: always `"Claude Code parity"` for parity cards

**After adding cards**:
1. Run: `./vanta-ts/node_modules/.bin/tsx --tsconfig vanta-ts/tsconfig.json vanta-ts/src/cli.ts roadmap build`
2. Commit: `git add roadmap.json vanta-ts/CC_AUDIT_TRACKER.md && git commit -m "feat(roadmap): p26 — N more cards"`
3. Push: `git push origin main` (do this frequently, after each batch)
4. Update `vanta-ts/CC_AUDIT_TRACKER.md` with pass number and card count

**Stop when**: 3 consecutive passes each find ≤2 new cards.

---
