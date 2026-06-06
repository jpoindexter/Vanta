# Handoff — Roadmap + MCP Build Plan
Generated: 2026-06-03 18:30
Project: Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta (agent code in `argo-ts/`)
Branch: feat/v1-hermes-parity (2 commits ahead of origin — NOT pushed)

## What Was Accomplished This Session

1. **O9 dark factory confirmed complete** — all tasks 1–11 were already done and pushed from the prior session. 554 TS + 27 Rust tests pass, tsc clean. The handoff doc `handoff-2026-06-03-1515-o9-factory-mid-impl.md` was stale; work had finished.

2. **MCP discussion + design** — Vanta needs to use MCPs, make MCPs, and be an MCP server. The MCP client is already built (`argo-ts/src/mcp/client.ts` + `mount.ts`, tested, wired in `session.ts`). The only gap is config discovery (format + location mismatch with Claude's `.mcp.json`).

3. **ROADMAP.md updated** — new `v1.6 — MCP: use · make · serve` section (3 phases, done-criteria each, sized). New `SEC · Secret-hygiene hardening` item. Both committed.

4. **Design doc written** — `docs/superpowers/specs/2026-06-03-interactive-roadmap-design.md` (roadmap.json → roadmap.html, Now/Next/Later, agent-ready source).

5. **DECISIONS.md updated** — "All Vanta documentation must be agent-ready" principle appended. Committed.

6. **Security false alarm resolved** — cosmos `.mcp.json` had a live token but was NEVER committed (full git history scan clean). No rotation needed. SEC item added to roadmap to wire gitleaks hook so this never requires a freakout again.

7. **Memory saved** — `docs-agent-ready.md` + `interactive-roadmap.md` in session memory.

## Files Changed This Session

| File | Status | What Changed |
|------|--------|-------------|
| `ROADMAP.md` | Modified | v1.6 MCP track (3 phases) + SEC item + MCP client already-shipped note |
| `DECISIONS.md` | Modified | Agent-ready docs principle appended |
| `docs/superpowers/specs/2026-06-03-interactive-roadmap-design.md` | Created | Full design: roadmap.json source → roadmap.html generated view |

## Current State

- **Tests:** 554 TS + 27 Rust = **581 green**; `tsc` clean
- **Branch:** `feat/v1-hermes-parity`, 2 commits ahead of origin, NOT pushed
- **Uncommitted:** only `handoff-2026-06-03-1515-o9-factory-mid-impl.md` (stale; can delete or leave)
- **No in-progress code** — this session was all planning/docs

## Build Order (execute in this exact sequence)

| # | Slice | Size | Done criteria | Model |
|---|-------|------|--------------|-------|
| 1 | Interactive roadmap | S | `argo roadmap` opens Now/Next/Later HTML; Vanta reads json natively | Sonnet |
| 2 | SEC gitleaks hook | S | secret-shaped strings can't be committed | Sonnet |
| 3 | MCP-1 consume | S | `argo mcp list` shows Cosmos tools; Vanta calls one | Sonnet |
| 4 | MCP-2 make + hook | M | Vanta builds trivial MCP, mounts it, calls it; and mounts existing | Sonnet |
| 5 | MCP-3 serve | M/L | Claude Code calls an Vanta tool through the kernel gate | **Opus** |

---

## Slice 1 — Interactive Roadmap (build this first)

**Spec:** `docs/superpowers/specs/2026-06-03-interactive-roadmap-design.md` — read it.

**What to build:**
- `roadmap.json` at repo root — structured source of truth, seeded from ROADMAP.md
- `argo-ts/src/roadmap/schema.ts` — Zod schema + types
- `argo-ts/src/roadmap/render.ts` — **pure** `renderRoadmap(data) → string` (inline CSS/JS, no deps, Now/Next/Later cols, track groups, status cards, click-to-expand done criteria, filter by track/status). Unit-tested.
- `argo-ts/src/roadmap/build.ts` — I/O: read `roadmap.json` → validate → write `roadmap.html`
- `argo-ts/src/roadmap/schema.test.ts` + `render.test.ts` + `build.test.ts`
- Wire `argo roadmap` in `cli.ts` (same pattern as other commands: `if (cmd === "roadmap")`)
- Add to `usage()` printout

**Data model (roadmap.json):**
```json
{
  "updated": "2026-06-03",
  "items": [
    {
      "id": "MCP-1",
      "track": "MCP: use · make · serve",
      "title": "Use any MCP (consume)",
      "status": "building",
      "size": "S",
      "summary": "Fix config discovery: accept mcpServers key + ./.mcp.json + argo mcp list.",
      "done": "argo mcp list shows a server's tools; Vanta calls one live."
    }
  ]
}
```

`status` ∈ `shipped | building | next | horizon`
Column map: `building → Now`, `next → Next`, `horizon → Later`, `shipped → collapsed lane`

**Seed roadmap.json from these items (complete list):**

```json
[
  {"id":"TUI","track":"Core UX","title":"Ink TUI + streaming","status":"shipped","size":"M","summary":"React/Ink 7 app — streaming transcript, tool activity, spinner, inline approvals, slash commands.","done":"open argo → full TUI with streaming tokens."},
  {"id":"REPL","track":"Core UX","title":"Full REPL + install","status":"shipped","size":"S","summary":"install.sh global argo command + full slash set.","done":"argo works from anywhere."},
  {"id":"A1","track":"Models + Setup","title":"Gemini provider","status":"shipped","size":"S","summary":"Google OpenAI-compatible endpoint, GEMINI_API_KEY.","done":"ARGO_PROVIDER=gemini argo run returns on gemini-2.5-flash."},
  {"id":"A3","track":"Models + Setup","title":"OpenRouter provider","status":"shipped","size":"S","summary":"One key, 200+ models.","done":"OPENROUTER_API_KEY works."},
  {"id":"A4","track":"Models + Setup","title":"argo setup wizard","status":"shipped","size":"M","summary":"Provider picker, hidden key prompt, merge into .env.","done":"First-run wizard configures any backend."},
  {"id":"A5","track":"Models + Setup","title":"First-run detection","status":"shipped","size":"S","summary":"No backend on launch → auto-run argo setup.","done":"Clean install self-configures."},
  {"id":"A6","track":"Models + Setup","title":"argo status / doctor","status":"shipped","size":"S","summary":"Boxed health: kernel ping, provider, key presence, counts.","done":"argo status shows green health."},
  {"id":"G1","track":"Models + Setup","title":"Claude subscription provider","status":"shipped","size":"S","summary":"ARGO_PROVIDER=claude-code uses Claude Pro/Max OAuth token.","done":"claude-code provider authenticates."},
  {"id":"G2","track":"Models + Setup","title":"ChatGPT-Codex OAuth","status":"shipped","size":"S","summary":"ARGO_PROVIDER=codex, Responses API, shared ~/.codex/auth.json.","done":"Live-verified end-to-end."},
  {"id":"B2","track":"Self-improvement","title":"Post-turn nudge counters","status":"shipped","size":"S","summary":"shouldReview: busy turn or periodic interval triggers background review.","done":"Review fires automatically."},
  {"id":"B3","track":"Self-improvement","title":"Background-review fork","status":"shipped","size":"M","summary":"Post-turn tool-restricted agent replays transcript, writes skills.","done":"Live-verified: judged no skill on trivial turn."},
  {"id":"B4","track":"Self-improvement","title":"Skill provenance + safe curator","status":"shipped","size":"M","summary":"argo-learned tag, curator archives only learned-stale skills, 7d interval.","done":"Curator runs at session start without breaking anything."},
  {"id":"O9","track":"Self-improvement","title":"Dark factory (self-improving codebase)","status":"shipped","size":"L","summary":"factory/ module: triage→plan→execute→verify→commit. argo improve + argo factory approve.","done":"Live end-to-end: verifier correctly rejected bad model output."},
  {"id":"C1","track":"Continuity","title":"Session persist + resume","status":"shipped","size":"M","summary":"File-based sessions, argo sessions list, argo resume <id>.","done":"Resume rehydrates a prior conversation."},
  {"id":"D1","track":"Skills","title":"Port skills library","status":"shipped","size":"M","summary":"10 high-value skills ported, argo skills install.","done":"10/10 installed live."},
  {"id":"E1","track":"Autonomy + Reach","title":"Daemon / service mode","status":"shipped","size":"M","summary":"argo gateway foreground daemon + launchd service manager.","done":"Foreground daemon starts/ticks/stops."},
  {"id":"E2","track":"Autonomy + Reach","title":"Telegram gateway","status":"shipped","size":"M","summary":"Long-poll + allowlist, wired into gateway.","done":"Offline-tested; live needs bot token."},
  {"id":"E3","track":"Autonomy + Reach","title":"Webhook triggers","status":"shipped","size":"M","summary":"HMAC-gated webhook server, resolveDeliver, background agent run.","done":"Real localhost requests: 200 signed / 401 unsigned."},
  {"id":"E5","track":"Autonomy + Reach","title":"MCP client","status":"shipped","size":"M","summary":"Dependency-free stdio JSON-RPC client + mount.ts. Mounted in prepareRun.","done":"Protocol unit-tested; live needs a real server + config fix (MCP-1)."},
  {"id":"O1","track":"Senses + Autonomy","title":"Agent-chosen model on delegate","status":"shipped","size":"S","summary":"delegate tool with provider/model params.","done":"Agent routes subtasks to any backend."},
  {"id":"O2","track":"Senses + Autonomy","title":"Swarms","status":"shipped","size":"S","summary":"tools/swarm.ts — parallel multi-agent fan-out + synthesize.","done":"Swarm dispatches and returns."},
  {"id":"O3","track":"Senses + Autonomy","title":"Eyes (look_at_screen)","status":"shipped","size":"S","summary":"screencapture -x → vision model.","done":"Needs Screen Recording permission."},
  {"id":"O4","track":"Senses + Autonomy","title":"Camera (look_at_camera)","status":"shipped","size":"S","summary":"Webcam frame → vision model.","done":"Shipped."},
  {"id":"O5","track":"Senses + Autonomy","title":"Video (watch_video)","status":"shipped","size":"S","summary":"ffmpeg frame extraction → vision model.","done":"Shipped."},
  {"id":"O7","track":"Senses + Autonomy","title":"Speech + audio","status":"shipped","size":"S","summary":"speak TTS + transcribe STT.","done":"Shipped."},
  {"id":"S1","track":"Selfhood","title":"Self-authored identity files","status":"shipped","size":"M","summary":"Brain regions, brain tool, SOUL.md, AGENT-MANIFESTO.md.","done":"Vanta has a persistent identity."},
  {"id":"P1","track":"Hermes Parity","title":"Slash-command parity","status":"shipped","size":"M","summary":"/history /retry /undo /reset /title /fork.","done":"Full slash parity readline + TUI."},
  {"id":"ROADMAP","track":"Docs + Tooling","title":"Interactive product roadmap","status":"building","size":"S","summary":"roadmap.json (agent-ready) → roadmap.html (Now/Next/Later view). argo roadmap command.","done":"argo roadmap opens the view; Vanta reads roadmap.json natively."},
  {"id":"SEC","track":"Docs + Tooling","title":"Secret-hygiene hardening","status":"next","size":"S","summary":"gitleaks pre-commit hook + .example twins + pre-push check.","done":"A secret-shaped string can't be committed."},
  {"id":"MCP-1","track":"MCP: use · make · serve","title":"Use any MCP (consume)","status":"next","size":"S","summary":"Accept mcpServers key + discover ./.mcp.json. argo mcp list.","done":"argo mcp list shows a server's tools; Vanta calls one live."},
  {"id":"MCP-2","track":"MCP: use · make · serve","title":"Make + hook in at runtime","status":"horizon","size":"M","summary":"mount_mcp tool (live runtime mount) + build-mcp-server skill (scaffold on demand).","done":"Vanta builds a trivial MCP, mounts it, calls its tool; and mounts an existing server on command."},
  {"id":"MCP-3","track":"MCP: use · make · serve","title":"Be a server (serve)","status":"horizon","size":"L","summary":"argo mcp serve — expose Vanta tools over MCP stdio, callable from Claude Code. Kernel-gated + allowlist.","done":"A tool call from Claude Code into Vanta executes through the kernel gate."},
  {"id":"E-eff2","track":"Efficiency","title":"Prefer-local routing","status":"horizon","size":"S","summary":"Auto-route simple work to local Ollama on M4 Pro.","done":"Simple tasks dispatch to Ollama without manual ARGO_PROVIDER override."},
  {"id":"D2","track":"Skills","title":"Skill bundles","status":"horizon","size":"S","summary":"YAML bundle schema for composite slash commands.","done":"One /slash loads several skills."},
  {"id":"S5","track":"Selfhood","title":"Heartbeat selfhood updates","status":"horizon","size":"S","summary":"Wire brain writes onto the gateway tick.","done":"Identity evolves continuously via daemon."},
  {"id":"B-v2","track":"Self-improvement","title":"Emergent self-designed brain","status":"horizon","size":"L","summary":"Let Vanta design its own brain substrate (its own format/code).","done":"Open research — no fixed done line."},
  {"id":"U2","track":"Core UX","title":"@-file mentions","status":"horizon","size":"M","summary":"Composer path autocomplete for file attachment.","done":"Type @ in TUI → path autocomplete."}
]
```

**CLI pattern to follow** (from existing cli.ts):
```typescript
if (cmd === "roadmap") return runRoadmapCommand(repoRoot);
```

Import + implement `runRoadmapCommand` like `runFactoryCommand`:
```typescript
async function runRoadmapCommand(repoRoot: string): Promise<void> {
  const { buildRoadmap } = await import("./roadmap/build.js");
  const htmlPath = await buildRoadmap(repoRoot);
  const { execSync } = await import("node:child_process");
  execSync(`open "${htmlPath}"`);
  console.log(`  → opened ${htmlPath}`);
}
```

---

## Slice 2 — SEC Gitleaks Hook

**What to build:**
- `.gitleaks.toml` at repo root (baseline config)
- `.husky/pre-commit` OR `.git/hooks/pre-commit` script that runs `gitleaks protect --staged`
- Install gitleaks check in `bootstrap.sh` / `install.sh` with a note if missing
- `.mcp.json.example` at repo root with placeholder values
- Add `gitleaks` check note to `argo-ts/CLAUDE.md` gotchas

**Check first:** does `gitleaks` exist? `which gitleaks`. If not, use `brew install gitleaks` in the install script.

---

## Slice 3 — MCP-1 Consume (config discovery)

**What to change** (only `argo-ts/src/mcp/mount.ts` + `mount.test.ts`):

1. **Accept `mcpServers` key** alongside `servers` in `readMcpConfig`:
```typescript
const ConfigSchema = z.object({
  servers: z.record(ServerSchema).optional(),
  mcpServers: z.record(ServerSchema).optional(),
}).transform(d => ({
  servers: { ...(d.mcpServers ?? {}), ...(d.servers ?? {}) }
}));
```

2. **Discover `.mcp.json` in cwd** before falling back to `~/.argo/mcp.json`:
```typescript
export async function readMcpConfig(env: NodeJS.ProcessEnv, cwd = process.cwd()): Promise<McpConfig> {
  const inline = env.ARGO_MCP_SERVERS?.trim();
  if (inline) return parseOrEmpty(inline);
  // project-level first (Claude-compat), then user-level
  const projectCfg = await readFile(join(cwd, ".mcp.json"), "utf8").catch(() => "");
  const userCfg = await readFile(join(resolveArgoHome(env), "mcp.json"), "utf8").catch(() => "");
  // merge: user-level fills gaps, project-level wins on conflict
  const project = projectCfg ? parseOrEmpty(projectCfg) : { servers: {} };
  const user = userCfg ? parseOrEmpty(userCfg) : { servers: {} };
  return { servers: { ...user.servers, ...project.servers } };
}
```

3. **`argo mcp list` already exists** in `repl-commands.ts` (case "mcp", line 388). It currently only reads from the old config locations. After the config change it will automatically show discovered servers. Verify it works end-to-end.

---

## Slice 4 — MCP-2 Make + Hook In

**Two parts:**

**Part A — `mount_mcp` tool** (`argo-ts/src/tools/mount-mcp.ts`):
- Args: `{ command: string, args?: string[], env?: Record<string,string>, name: string }`
- `describeForSafety`: `"spawn mcp server ${name}: ${command}"` → kernel `assess()` gates it
- `execute`: calls `stdioTransport` + `McpClient.initialize()` + `listTools()` → registers each tool in the registry → returns list of tool names
- The registry must be injectable/accessible from the tool. Pass it via tool context (see how `delegate` accesses its provider — check `argo-ts/src/tools/delegate.ts`).
- Add to `argo-ts/src/tools/index.ts`
- Add name to sorted list in `argo-ts/src/tools/tools.test.ts`

**Part B — `build-mcp-server` skill** (`argo-ts/skills-library/build-mcp-server.md`):
- Teaches Vanta to scaffold a new MCP server from a description: create a TS project with `@modelcontextprotocol/sdk`, wire one tool, `npm run build`, then call `mount_mcp` to hook it in.
- This is a skill (markdown), not code.

---

## Key Constraints (don't re-litigate)

1. **ESM only** — all new code uses `import`, no `require()`. Dynamic imports with `await import(...)`.
2. **No new deps unless absolutely necessary** — MCP client has zero deps by design (injectable transport). The `mount_mcp` tool can import from `./mcp/client.js` and `./mcp/mount.js`.
3. **Kernel gate on every MCP spawn** — `describeForSafety` must return a string that lets `assess()` classify it correctly. Spawning a new process = `Ask` level.
4. **554 TS + 27 Rust tests must stay green** after every slice. Run `npx vitest run && npx tsc --noEmit` after each.
5. **File size limits** — 300 hard, 200 soft. `render.ts` will be longish (inline HTML template); keep the pure data-to-html logic separate from the template string.
6. **Tools list test** — `argo-ts/src/tools/tools.test.ts` has a sorted tool-name list. If you add `mount_mcp` (slice 4), add its name there.
7. **ROADMAP.md status** on each slice: update the corresponding item to `[x]` when done + add to the "SHIPPED" log.

---

## Context That's Easy to Lose

- `session.ts:50` calls `mountMcpServers(registry, process.env, ...)` — this is where slice 3's config changes take effect. No other wiring needed for consume.
- The `/mcp` repl slash command already exists at `repl-commands.ts:388` — it calls `readMcpConfig`. After slice 3 changes that function, the slash command works too.
- Slice 4's `mount_mcp` tool needs access to the live tool registry. Check `argo-ts/src/tools/delegate.ts` to see how delegate accesses its runtime deps (it uses an injected closure pattern). Mirror that.
- The `roadmap.html` file should be gitignored (generated artifact). Add `roadmap.html` to `.gitignore`.
- MCP-3 (serve) is intentionally left for Opus — don't start it in this session.

---

## Continuation Prompt

Paste this into a new Claude session on **Sonnet 4.6** to resume:

---
Resume Vanta. Repo: `/Users/jasonpoindexter/Documents/GitHub/Vanta` (TS agent in `argo-ts/`, branch `feat/v1-hermes-parity`, 2 commits ahead of origin — NOT pushed). 581 tests green (27 Rust + 554 TS), tsc clean.

**Your job:** Build slices 1–4 in order. STOP after slice 4. Do NOT start slice 5 (MCP-3 serve) — that's for an Opus session.

The build plan and all context is in `handoff-2026-06-03-1830-roadmap-mcp-plan.md` at the repo root. Read the FULL file before writing any code. It has exact file shapes, data structures, seeded JSON, and constraints for every slice.

**Slice order:**
1. Interactive roadmap — `roadmap.json` + `argo-ts/src/roadmap/` (schema/render/build) + `argo roadmap` CLI
2. SEC gitleaks hook — `.gitleaks.toml` + pre-commit hook + `.mcp.json.example`
3. MCP-1 consume — extend `readMcpConfig` in `mount.ts` to accept `mcpServers` key + `./.mcp.json` discovery
4. MCP-2 make/hook-in — `mount_mcp` tool + `build-mcp-server` skill

After all four slices: push the branch, then tell the user "Slices 1–4 complete. Switch to Opus for MCP-3 (serve)."

**Hard constraints from handoff:**
- ESM only (no require())
- No new deps unless necessary
- 554 TS + 27 Rust tests stay green after every slice (run `cd argo-ts && npx vitest run && npx tsc --noEmit` after each)
- If you add `mount_mcp` tool in slice 4, add its name to `argo-ts/src/tools/tools.test.ts` sorted list
- `roadmap.html` goes in `.gitignore`
- STOP at slice 4 — no MCP-3
---
