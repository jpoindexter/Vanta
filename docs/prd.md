# Vanta PRD

## One-line thesis

Vanta is a personal AI operator — a real digital person that knows your goals, acts safely, learns from experience, and can do everything a smart operator would do across code, research, comms, calendar, and business work.

> **Status (2026-06-02): v0 complete → building v1 (Full Hermes Parity).**
> All 7 original phases below are **done** (32 tools, 290 tests green) — that's v0,
> "has all the parts." v1 makes Vanta *feel and work* like a full personal agent:
> hook to any model (ChatGPT/Claude/Gemini/local/OpenRouter) via a first-run wizard,
> remember conversations across sessions, learn from what it does (self-improvement
> loop), borrow Hermes's skill library, and run as a service you can text.
> **Ordered v1 build list + sequencing: see [`../ROADMAP.md`](../ROADMAP.md).**
> The phase roadmap in this PRD is the historical v0 record.

---

## What Vanta is

Vanta is not a chatbot. Not a dashboard. Not a wrapper.

Vanta is a full-capability personal operator agent with one structural advantage over everything that came before: it knows the goal before it picks a tool, enforces scope on every action, and reports only what it actually verified.

**The lineage:**
- OpenClaw → gave agents a body (tool execution)
- Hermes → gave agents a personal runtime (chat + tools + memory, reactive)
- Vanta → a real digital person (goal-aware, scope-enforced, fully capable, trusted)

**What Hermes users are asking for** (from open issues, by demand):
- Better web search with privacy options — SerpAPI, Searxng, Brave (95 combined reactions)
- Clean accessible UI (40 reactions)
- Cross-agent communication / subagent delegation (46 reactions)
- Versioned backups for memory and skills (17 reactions)
- Claude subscription auth instead of API keys (14 reactions)

Vanta is designed to address all of these natively — privacy-first search, git-versioned skills/memory, better architecture throughout.

---

## What a real digital person can do

Vanta's full capability target — every phase owned:

| Capability | Phase |
|---|---|
| Block unsafe actions (Rust kernel) | Done |
| Read, write, edit files | 1 |
| Run shell commands | 1 |
| OpenAI + Ollama + Anthropic models | 1 |
| Know your active goals | 1 |
| Learn from experience (skills system) | 2 |
| Remember context across sessions | 2 |
| **Search the web (privacy-first)** | **2** |
| Browse websites / extract content | 3 |
| Understand screenshots / images | 3 |
| Execute and test code | 4 |
| Navigate codebases (LSP) | 4 |
| Git operations with approval gates | 4 |
| Read and send email | 5 |
| Manage calendar | 5 |
| Post to Slack / Discord | 5 |
| Run unattended scheduled tasks | 6 |
| Spawn and coordinate subagents | 6 |
| Cross-agent communication (A2A) | 6 |
| Operate across multiple projects | 7 |
| Business operator modes | 7 |
| Route tasks across models by cost | 7 |

---

## Core principles (non-negotiable in every phase)

### 1. Goal before tool
Every session starts by loading active goals. The agent knows what it is working toward before selecting any action.

### 2. Safety enforced, not advisory
The Rust kernel is the security boundary. `assess()` is a gate — blocked means blocked. Not a warning. Not optional.

### 3. Verified output only
The agent does not declare a task complete without verified tool output proving it. No fake progress. Ever.

### 4. Scope enforced
Every file operation, shell command, and external call is gated through the safety kernel. No silent side effects outside approved scope.

### 5. Approval before risk
Risky operations enter the approval queue before execution. Jason approves interactively or async via the cockpit.

### 6. Learns from experience
After completing complex tasks, Vanta creates skill files that encode what worked. Skills are plain markdown — readable, editable, git-versioned. This also solves the Hermes backup problem: version control is built in.

### 7. Privacy-first by default
Web search defaults to DuckDuckGo (no API key, no tracking). Self-hosted Searxng is the recommended power-user option. Cloud providers (SerpAPI, Brave) are opt-in.

### 8. Honest about limits
When a task is outside scope, unsupported, or uncertain — Vanta stops and says so. Stopping is always better than faking.

---

## Architecture

```
Rust safety kernel (vanta-kernel)
  → assess(), approve(), goals, events
  → HTTP sidecar on :7788
  → security boundary — enforced always

TypeScript agent layer (vanta-ts)
  → agent loop: goal-inject → plan → assess → execute → verify
  → LLM providers: OpenAI, Ollama, Anthropic (typed interface, swappable)
  → search providers: DuckDuckGo, Searxng, SerpAPI, Brave (typed interface, swappable)
  → tool registry: every tool defined, typed, scoped
  → skills: ~/.vanta/skills/ (markdown + YAML, git-versioned)
  → memory: ~/.vanta/memories/ (per-goal summaries, git-versioned)

MCP integrations (Jason's existing setup — Phase 5)
  → Gmail, Google Calendar, Drive
  → Supabase, Vercel (dev tools)
  → Figma, PostHog (product tools)
  → Slack, Discord (future)
```

---

## Phase roadmap — v0 (COMPLETE)

> All phases below shipped. Kept as the historical record of how v0 was built.
> The forward build list is [`../ROADMAP.md`](../ROADMAP.md) (v1 — Full Parity).

### Phase 1 — Agent Loop ✅
**Done when:** `vanta run "read README and summarize"` works end-to-end with verified output. `vanta run "delete everything"` blocked before execution. Ollama works offline.

Delivers:
- `vanta-ts/` TypeScript package
- OpenAI + Ollama provider (one adapter, baseURL swap)
- Anthropic provider stub
- Tool registry: `read-file`, `write-file`, `shell-cmd`, `inspect-state`
- Three-tier system prompt (SOUL.md + VANTA.md/AGENTS.md/CLAUDE.md discovery + active goals)
- Agent loop: messages[], goal injection, tool dispatch, pause-on-ask approval
- Context trimmer (protect first 3 + last 6, 75% trigger)
- Kernel auto-start from CLI
- `vanta run "<instruction>"` CLI entry

Out of scope: memory persistence, skills, web search, browser.

---

### Phase 2A — Skills & Memory
**Done when:** Vanta remembers what it did toward a goal across sessions. After a complex task, it creates a skill file. A week later, it recalls and applies that skill automatically.

Delivers:
- **Skills system** — `~/.vanta/skills/<name>/SKILL.md` (markdown + YAML frontmatter, cross-compatible with Hermes format)
- **Slash commands** — `/skills`, `/skill <name>` list and invoke skills
- **Curator** — background maintenance: consolidate overlapping skills, archive stale (30d inactive), remove old (90d)
- **Memory** — per-goal session summaries in `~/.vanta/memories/<goal-id>.md`
- **Memory injection** — volatile tier includes recent goal memory on every session start
- `write-skill` tool — agent creates skill files from experience (the actual learning loop)
- `recall` tool — full-text search across skill library
- LLM-based context compression (replaces Phase 1 trim-only approach)
- Skills and memory are plain files — git-versioned by default, no special backup needed

---

### Phase 2B — Web Search ← moved up from Phase 3
**Done when:** `vanta run "research the latest on X and summarize"` returns a cited report using web results, with no API key required by default.

This moved up because it's the #1 most requested Hermes feature (95 combined reactions across 3 issues). It unlocks research tasks that make Vanta genuinely useful for business operator work.

Delivers:
- **SearchProvider interface** — same pattern as LLMProvider: `search(query, config) → SearchResult[]`
- **DuckDuckGo adapter** — no API key, no tracking, works out of the box (default)
- **Searxng adapter** — self-hosted, `VANTA_SEARCH_URL=http://localhost:8080` (recommended for privacy)
- **SerpAPI adapter** — opt-in, `VANTA_SEARCH_PROVIDER=serpapi` + key
- **Brave Search adapter** — opt-in, privacy-focused, citations, `VANTA_SEARCH_PROVIDER=brave`
- `web-search` tool — calls search provider, returns top N results as structured JSON
- `web-fetch` tool — fetch any URL, extract readable text (Mozilla Readability), return clean markdown
- Provider config identical to LLM config: one env var switches everything
- Research skill templates: `~/.vanta/skills/research/` bundled with install

```
VANTA_SEARCH_PROVIDER=ddg          → DuckDuckGo (default, no key)
VANTA_SEARCH_PROVIDER=searxng      → self-hosted Searxng (VANTA_SEARCH_URL required)
VANTA_SEARCH_PROVIDER=serpapi      → SerpAPI (SERPAPI_KEY required)
VANTA_SEARCH_PROVIDER=brave        → Brave Search (BRAVE_KEY required)
```

---

### Phase 3 — Browser & Vision
**Done when:** Vanta can open a URL, take a screenshot, understand what it sees, and extract structured data — all from a single instruction.

Delivers:
- `screenshot` tool — Playwright headless screenshot of any approved URL
- `browser-navigate` tool — click, fill form, scroll, extract — scoped to approved domain allowlist
- `browser-extract` tool — structured extraction from page (tables, lists, specific elements)
- Image understanding — pass screenshots to GPT-4o or Claude vision for analysis
- Domain allowlist — browser tools only hit approved domains; new domains are `risk: ask`
- Vision skill templates: `~/.vanta/skills/vision/` — screenshot-analysis, form-fill, data-extract patterns

---

### Phase 4 — Code & Dev
**Done when:** Vanta can take a GitHub issue, write a fix, run tests, and propose a PR — with every step approval-gated and every result verified.

Delivers:
- `run-code` tool — execute Python/Node/Rust in a scoped subprocess with timeout, capture stdout/stderr
- `lsp-diagnostics` tool — get type errors and warnings for a file without running it
- `lsp-definition` tool — go-to-definition, find-references for any symbol
- `git-status`, `git-diff` — always `risk: allow` (read-only)
- `git-commit`, `git-push` — always `risk: ask`, require explicit approval
- `git-branch`, `git-checkout` — `risk: ask`
- Project context auto-detection — reads `VANTA.md`, `CLAUDE.md`, `README.md`, `AGENTS.md` from cwd, injects into context tier
- Code skill library: `~/.vanta/skills/code/` — debug, refactor, test-write, PR-review patterns
- Anthropic adapter (full) — implement in this phase; Claude is significantly better at code than GPT-4o-mini

---

### Phase 5 — Communications & Calendar
**Done when:** Vanta can draft and send an email, schedule a meeting, and create a Drive doc — all from a single instruction, with approval before every outbound action.

All comms tools route through the MCP infrastructure already connected to Jason's account.

Delivers:
- `gmail-search` tool — search inbox, return thread summaries
- `gmail-read` tool — read full thread
- `gmail-draft` tool — create draft, never auto-send (`risk: ask` always)
- `gmail-send` tool — send an approved draft, explicit approval required, always
- `calendar-read` tool — list events, check availability
- `calendar-create` tool — propose event (`risk: ask`)
- `calendar-update` tool — modify existing event (`risk: ask`)
- `drive-read` tool — read document content
- `drive-create` tool — create new document (`risk: ask`)
- `drive-update` tool — update existing document (`risk: ask`)
- **Comms rule: every outbound action (send, create, update) is always `risk: ask`.** No exceptions. No auto-send ever.
- Claude subscription auth — support OAuth-based auth for Anthropic (no API key needed for Claude Pro/Max subscribers)

---

### Phase 6 — Autonomous Operation
**Done when:** Vanta runs a scheduled daily briefing at 8am without Jason doing anything — and every action in that briefing still goes through the approval queue before executing.

Delivers:
- Cron scheduler — `vanta schedule "daily briefing" --cron "0 8 * * *"`, stored in `.vanta/cron.tsv`
- Scheduled task runner — wakes, loads goal context, executes, logs to events.jsonl
- All scheduled actions gate through safety kernel — no blanket auto-approval for scheduled work
- **Subagent spawning** — parent agent decomposes work, spawns workers with explicit scoped permissions
- Worker isolation — each subagent: own goal, own scope, own iteration budget (50), cannot modify parent state
- Parent aggregates verified results only
- **A2A protocol stub** — basic cross-agent communication interface (Google A2A format) for future cross-agent delegation
- Approval queue for async scheduled work — risky actions queue in cockpit, Jason approves on next check-in

---

### Phase 7 — Digital Person
**Done when:** Vanta can run a full "weekly operator review" — checks every active project, summarizes status, flags blockers, drafts updates, proposes next actions — and delivers it as a structured brief ready to act on.

Delivers:
- **Project rooms** — Vanta knows each `~/Documents/GitHub/_active/` project, can load context per project, track separate goal streams
- **Business operator modes** (encoded as skills — Jason can customize):
  - `build-product-slice` — PRD → code → test → PR
  - `research-to-offer` — research topic → synthesize → draft proposal → queue for send
  - `weekly-review` — check all projects, summarize, flag blockers, propose priorities
  - `revenue-push` — identify revenue action → draft outreach → queue for approval
  - `pre-ship-review` — run checks, review diff, propose go/no-go
  - `inspect-opportunity` — research market, score idea, draft one-pager
- **Multi-model routing** — classify task → cheap model (gpt-4o-mini, llama3.2) for tool calls and summaries, expensive model (gpt-4o, claude-opus) for planning, synthesis, and code
- **Mode learning** — after running a workflow 3 times, Vanta proposes encoding it as a skill

---

## v1 — Full Hermes Parity (current focus)

v0 has every subsystem; v1 closes the *experience + self-improvement* gap that made
it feel like scripts. Built from a full read of the Hermes reference. Seven tracks —
**ordered build list, sizes, and "done when" live in [`../ROADMAP.md`](../ROADMAP.md)**:

- **A — Hook to any model + full setup.** Gemini + OpenRouter providers, a declarative provider registry (so new backends auto-wire), `vanta setup` first-run wizard (provider picker → masked key → merged `.env` → model pick), first-run auto-launch, `vanta status`/`doctor`. *Delivers the headline: "open vanta → setup → hook to ChatGPT/Claude/Gemini → run."*
- **B — Self-improvement loop.** A minimal hook spine, post-turn nudge counters, a **background-review fork** (whitelisted to memory+skills, replays each turn, writes its own skills), and a **safe curator** (consolidate + archive, **never auto-delete**; provenance so it only touches agent-created skills). *This is "how it self-improves everything."*
- **C — Continuity.** SQLite session persist + resume (`vanta --resume`, `sessions browse`). *So it stops forgetting between runs.*
- **D — Borrow the skills library.** Port the top ~20 of ~181 portable Hermes/OpenClaw `SKILL.md`s (coupling stripped) + adopt skill bundles.
- **E — Autonomy & reach.** Daemon/service mode (launchd, in-process cron tick), a first messaging gateway (Telegram), webhook triggers + deliver targets, steer/interrupt, MCP client, optional ACP server.
- **F — Robustness steals.** Message sanitization, loop guardrails, subdirectory hints, jittered retry backoff.
- **G — Subscription auth.** Claude / ChatGPT-Codex / Gemini-CLI OAuth (enhances A; API keys work without it).

**v1 done (one sentence):** Open `vanta` → it talks back → a wizard configures any model
backend without editing files → it remembers conversations → it learns from what it does
→ it's reachable as a background service.

---

## What Vanta does NOT do (ever)

- Delete or overwrite files without explicit approval
- Send any message (email, Slack, social) without explicit approval
- Touch outside the approved scope without approval
- Claim success without verified tool output
- Run destructive commands (rm -rf, DROP TABLE, reset --hard)
- Store or log secrets
- Operate autonomously without the safety gate
- Browse domains not on the approved allowlist without approval

---

## Vanta vs Hermes — the real difference

| | Hermes | Vanta |
|---|---|---|
| Safety | Advisory — "NOT a security boundary" | Enforced — Rust kernel is the boundary |
| Goal awareness | None — reactive | First-class — loaded before every session |
| Scope enforcement | Optional env var | Always on — every action gated |
| Verification | Prompt instruction | Runtime check — empty = not done |
| Fake progress | Possible | Blocked by design |
| Web search | SerpAPI, DuckDuckGo | DDG (default) + Searxng + SerpAPI + Brave |
| Privacy-first search | No | Yes — Searxng self-hosted is the recommended option |
| Skills | Markdown files | Same — cross-compatible with Hermes |
| Skill backups | Manual cron needed | Git-versioned by default — no extra work |
| Memory | Plugin provider | Same pattern — goal-linked summaries |
| Comms | Telegram, Discord, Slack (broad) | Gmail + Calendar ✅ · Telegram gateway (v1 E2) |
| Code execution | Yes | ✅ run-code + LSP + git |
| Browser | Yes | ✅ Playwright + vision |
| Autonomy | Broad | Scoped + approval-gated · daemon (v1 E1) |
| Multi-agent | Delegation only | ✅ subagents + local A2A · ACP server (v1 E6) |
| Stack | Python 559MB (hard to own) | TypeScript + Rust (your stack) |
| Model backends | ~28 (registry) | OpenAI/Ollama/Anthropic ✅ · Gemini/OpenRouter + registry (v1 A) |
| Setup | First-run wizard | Edit `.env` → first-run wizard (v1 A4) |
| Sessions | Persist + resume | Per-goal memory ✅ · full transcripts (v1 C1) |
| Self-improvement | Background review + curator | Pieces built ✅ · wired into loop (v1 B) |
| Auth | API keys + subscription OAuth | API keys ✅ · subscription OAuth (v1 G) |

---

## Done criteria — Phase 1

- [ ] `vanta run "list my active goals"` → reads kernel, responds with goal list
- [ ] `vanta run "read README.md and summarize"` → reads file, returns summary with verification step visible
- [ ] `vanta run "delete everything"` → blocked before any execution, no files touched
- [ ] `vanta run "install a daemon"` → queued for approval, not executed
- [ ] `VANTA_PROVIDER=ollama vanta run "what are my goals"` → uses local model, no internet required
- [ ] All Rust tests pass (`cargo test`)
- [ ] All TS tests pass (`npm test`)
- [ ] Kernel auto-starts if not running

---

## Open questions (v0 ones resolved; v1 ones live)

**Resolved in v0:**
1. ~~Comms route through kernel `assess()` or TS-only?~~ → Every tool, comms included, gates through kernel `assess()`. (DECISIONS)
2. ~~Project rooms stored or inferred?~~ → Inferred from `~/Documents/GitHub/_active/` via `VANTA_PROJECTS_DIR`.
3. ~~Skills cross-compatible with Hermes format?~~ → **Yes** — same `SKILL.md` + YAML frontmatter; confirmed ~181 Hermes/OpenClaw skills are directly portable (v1 D).
5. ~~A2A: Google protocol or Vanta-native?~~ → Local in-process bus shipped; networked = **ACP server** in v1 E6 (Hermes has no peer-to-peer A2A either).

**Live for v1:**
- **MCP client vs own each integration** (v1 E5) — Hermes mounts MCP servers (stdio + HTTP); Vanta went direct for Google. Add an MCP client as a general tool gateway, or keep owning integrations? Leaning: add the client, keep Google direct as the reference impl.
- **Curator delete policy** — Hermes **never auto-deletes** (archive only, recoverable). Vanta's `curator.ts` currently *removes* at 90d. v1 B4 changes this to archive. (Effectively decided — log in DECISIONS when implemented.)
- **Setup config format** — write provider/model to `.env` (current) or a `config.yaml` like Hermes? Leaning: `.env` merge for v1 (no new parser), revisit if config grows.
- **Desktop app** (Tauri, consistent with indx) vs CLI + cockpit — still deferred (PARKED).
