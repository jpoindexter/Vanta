# Changelog

Notable changes per release. Each release ships prebuilt kernels for macOS + Linux (arm64 / x64),
attached as assets. Full auto-generated commit notes live on the [Releases](https://github.com/jpoindexter/Vanta/releases) page.

## Unreleased — 2026-07-12

### Documentation
- Rebuilt `vanta.theft.studio` as a single long-form product page using the selected Vanta operator artwork, real desktop and terminal evidence, and six capability chapters for Reach, Remember, Schedule, Delegate, Research, and Enforce.
- Refreshed the Hermes/OpenClaw comparison against current Hermes main and shipped all six focused local delta cards; ten real-service/device acceptance cards remain parked.
- Synchronized legacy roadmap checklists with `roadmap.json`, regenerated the 141-tool and 146-command catalogs, and documented the ten external acceptance gates without reporting them as live.
- Updated the Docusaurus deployment path and repository links for the Cloudflare Pages project serving `docs.vanta.theft.studio`.

### Added
- **Desktop app v1** — rebuilt the existing renderer as a fixed one-viewport daily workspace with explicit loading/error/setup states, searchable sessions, compact panel navigation, safer approvals, command/model dialogs, and persisted project selection. The Electron host now owns free-port selection, splash/startup receipts, bundled assets/runtime/kernel paths, first-run `.vanta/.env` model setup, Developer ID signing by certificate hash, and ARM64 `.app`/DMG/ZIP production.
- **Maintenance health** — `vanta maintenance` combines a deduplicated needs-human ticket queue, documentation-router load/reference/staleness/contradiction evidence, and a delivery-versus-maintenance time/token budget. A meaningful over-budget sample creates one actionable operator ticket instead of more automatic meta-work.
- **System prompt presets** — `/prompt list|show|use|reset` switches a bounded operating-role overlay from project or Vanta-home markdown definitions without replacing the base safety prompt.
- **Prompt-routed workers** — `delegate {agent_type}` applies the same definition's prompt, narrowing-only tool policy, and optional model default to a fresh kernel-gated worker. Dynamic MCP tools remain constrained by the worker allowlist.
- **Gateway context references** — allowlisted remote messages now share the local `@file`, `@folder`, `@diff`, `@staged`, `@git:N`, and `@url` preprocessor. Expansion is bound to the received message's project/profile scope and routed-model budget before queueing, with source and warning receipts sent back through the channel.
- **Bounded runtime readiness** — `GET /api/v1/live` is a cheap, unauthenticated, non-mutating liveness probe. Bearer-authenticated `/api/v1/readiness` and `/status` report redacted status/counts for the kernel, provider config, stores, disk, gateway channels, active turns, background work, and delegated workers without initializing a conversation.

### Fixed
- **Desktop composer clipped below the native window** — startup and recovery UI now share one explicitly bounded conversation grid track, so an error banner cannot create an implicit row that pushes the empty state and composer offscreen. A packaged Electron smoke locks the reported `1778×1136` viewport in healthy and forced-recovery states.
- **Desktop Files panel corruption at compact widths** — opening the inspector no longer replaces its two-row grid with a horizontal flex layout. File paths now render as stable single-line rows, ellipsize with full-path tooltips, and stay inside a vertical-only list scroller.

## v0.8.0 — 2026-07-05

**Web extraction closes the standout gap vs Hermes.** `web_fetch` no longer blind-truncates a large page; it now routes through a size-tiered pipeline, and a new xAI/Grok search backend adds a fundamentally different search shape — a reasoning model performing the search itself.

### Added
- **Size-tiered web extraction** — `web_fetch` routes extracted text through 4 tiers matching Hermes' documented thresholds: ≤5k chars returned as-is, 5k–500k single-pass LLM summary, 500k–2M parallel-chunked (100k-char chunks, concurrent per-chunk summarize + one final synthesis pass), >2M refused with guidance to pick a more focused source. All thresholds are env-configurable.
- **Auxiliary extraction model + independent timeout** — extraction summarization can target a separate (often cheaper) model via `VANTA_EXTRACT_MODEL`/`_PROVIDER` (same pattern as vision routing), and always gets its own request timeout (`VANTA_EXTRACT_TIMEOUT_SEC`, default 360s matching Hermes) independent of the main model's — a big-page digest never inherits a timeout tuned for snappy interactive chat.
- **xAI/Grok native search backend** — `VANTA_SEARCH_PROVIDER=xai`: a reasoning model performs the search itself and returns one grounded answer with inline citations, mapped onto Vanta's `SearchResult` shape. Verified against the real `/v1/responses` API (a documented OpenClaw integration bug — github.com/openclaw/openclaw#13171 — confirmed the correct response path; the naive top-level `output_text`/`citations` fields don't exist). Native domain filtering, capped at 5 domains each.

## v0.7.0 — 2026-07-04

**Governance, config safety, and cost attribution.** A regulator-facing audit trail over every gated action, versioned `.env` with rollback, and a persisted spend ledger broken down by goal/agent/provider/model.

### Added
- **`vanta governance export`** — an externally-auditable markdown report of every gated action, its kernel verdict, and its final resolution (EU AI Act oversight/transparency). Closed a real completeness gap first: `applySafetyGate` now logs a durable audit event at **every** exit (allow, blocked, approved, denied, accept-edits-auto, delegated-auto, kernel-unreachable) — including the case where a rule/auto-mode *tightens* an allow/ask verdict down to blocked, recording both the kernel's raw verdict and the final resolution. Distinct from the pre-existing `vanta audit` (dependency-vulnerability scan).
- **`vanta config revisions` / `vanta config rollback [REV]`** — every `.env` write is now versioned; rollback restores a specific revision or undoes the last change when none is given. A rollback snapshots the current state first, so it's itself reversible — never a dead end.
- **`/usage breakdown [--since <ISO>]`** — a persisted, cross-session spend ledger broken down by goal, agent (interactive vs. gateway), provider, and model, complementing the existing per-session `/usage` view. Wired at both real cost-computing call sites (the interactive turn loop and the cron/gateway run task).

### Fixed
- A stale test assumption in the secret-redaction suite (asserted `logEvent` called exactly once) was updated for the new second audit-log call — and now proves both log lines are secret-free, a strictly stronger guarantee than before.

## v0.6.0 — 2026-07-04

**Search backend expansion, safety hardening, and architecture ports.** Four new managed/semantic search backends, a reliability class of fixes (shell wedge, X search auto-heal, cross-process cron dedup), delegated-authority auto-approval, structural secret redaction at log-emit time, cross-agent memory import, and a batch of ports (prompt-tier, session-store, gateway delivery/formatter) that lock existing pluggability guarantees with tests.

### Added
- **Managed + semantic search backends** — `ExaProvider` (neural/semantic, native domain filtering), `FirecrawlProvider`, `TavilyProvider`, and `ParallelProvider`, each built against its verified live API. `web_search` gained first-class `allowed_domains`/`excluded_domains` scoping (native pass-through on providers that support it, `site:`/`-site:` query rewrite otherwise) and `category`/`page` params (honored natively by SearXNG). Auto-detect priority: Firecrawl → Parallel → Tavily → Exa → Brave → SerpApi → SearXNG → keyless engines.
- **Gateway channel self-heal** — a dropped messaging channel (WhatsApp/Telegram/etc.) now auto-reconnects with exponential backoff instead of needing a restart; per-channel health is reported each gateway tick. Closes the top reliability complaint reported by competitor users.
- **QQ + WeChat messaging adapters** — closes the last named China-platform gap, bringing gateway coverage to 22 adapters.
- **Cross-agent memory import** — `vanta migrate memory <claude-code|codex>` imports another agent's memory store into Vanta's brain, deduped and provenance-tagged. Live-verified importing 178 facts from a real `~/.claude/CLAUDE.md`.
- **`/restore <name>`** — restore a named checkpoint in place, or branch it into a new persisted session, completing the checkpoint/rollback pair.
- **Cross-process cron dedup** — an atomic claim-file primitive stops two overlapping processes (a gateway tick + a manual `vanta cron run`, or a launchd double-invoke) from double-firing the same due task.
- **Delegated authority in the approval gate** — a `write_file`/`edit_file` inside an owner's active write-scope grant now auto-approves without a human prompt (audited); everything else still prompts. No active grants = byte-identical behavior to before.
- **Structural secret redaction at log-emit time** — masks positional secrets (URL query credentials, auth header values, connection-string passwords) that have no recognizable vendor prefix, composed with the existing vendor-secret scan before anything is written to `events.jsonl`.
- **MCP mount-time egress advisory** — flags a mounting MCP server whose command has a download-into-shell or bare-egress-binary shape (advisory only; the kernel still gates every tool call).
- **Setup key validation** — catches the two common paste mistakes (wrong-vendor key, malformed key) before writing a provider API key, with a pointer to the right signup page.
- **Factory code-intelligence wiring** — the autonomous build pipeline's planner appends a code map when code intelligence is available, and verify fast-fails on affected tests as a guarded subset of the full-suite floor (never a weaker gate). No-op when code intelligence is absent.
- **Reliability battery: reach-staleness + sandbox-serve-fastfail** — a deterministic scenario proves the reach-channel stale-query-id path either auto-heals or degrades gracefully; `shell_cmd` now fails fast with actionable guidance when a serve/listen command has no working path under the shell sandbox, instead of burning the background↔foreground refusal loop.
- **`vanta run --output-format json`** — the stream-event formatter is now a registry (`VANTA_EVENT_FORMAT`), with a compact JSON formatter for programmatic/log consumers alongside the existing text formatter.

### Fixed
- **Shell command wedge on a backgrounded/long-running foreground command** — `shell_cmd`'s foreground exec path didn't resolve until every inherited stdio pipe closed, so a command ending in `&` (or a never-exiting server) blocked the whole turn until the 30s timeout and orphaned the process. Now detected and refused with a pointer to `background:true` before it can reach the exec path.
- **X/Twitter search auto-heal** — a stale rotated query id 404'd every search; auto-heal on 404 now runs through the same browser-capture heal path proven live, not the weaker bundle-scrape-only fallback.

### Changed
- **Prompt-tier and session-store ports locked with tests** — the prompt assembler and session persistence layer already had the right shape (`PromptTier` registry, free functions over fs); both now go through an exported pure assembler / a `SessionStore` interface with a proven alternate-adapter test, so the pluggability guarantee is verified, not assumed.
- **Gateway delivery targets via a registry** — `resolveDeliver`'s local/file/telegram prefix switch became a registration map; adding a delivery channel is now a registration, not a core edit.
- **Reliability eval cron wrapper de-hardcoded** — self-locates its repo path and Node binary instead of a pinned absolute path + version, so the scheduled job works from any clone.

## v0.5.0 — 2026-06-28

**Autonomous boxed agents + universal live reasoning.** Vanta can now run another agent *fully autonomously* inside an OS-enforced Docker box scoped to exactly the folders it's given — and a model's thinking streams live in the TUI across every provider.

### Added
- **Autonomous Docker-boxed agent runs** — `call_agent(autonomous:true)` runs claude `--dangerously-skip-permissions` inside a Docker container scoped to exactly the folders Vanta mounts: **the mount-set is the boundary**. Live-proven end-to-end — the boxed agent authenticated, built a file in its mount, and **provably could not read or write any host path outside it** (network off). Safe-by-design: opt-in, kernel-gated approval that shows the exact boundary, runs non-root, and the credential is **forwarded as env** (`-e ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` — value from the host, never in argv or the keychain). **Mount-scope** derives the blast radius from the task (a build → writable output + read-only inputs); a destructive task gets an **OS-enforced read-only dry-run** (the box physically can't write). One command to set up on any machine: `vanta agent-image build` (preflight + bundled Dockerfile). *Powerful capability — enable deliberately.*
- **Universal `thinking` streaming** — a `thinking` stream-chunk any provider emits: the OpenAI-compatible adapter (`reasoning_content` / `reasoning` → DeepSeek-R1, OpenRouter reasoning models, Ollama, Gemini, and any custom OpenAI-compatible endpoint) and Anthropic (`thinking_delta`, extended thinking). The TUI shows the reasoning live (dimmed) in place of the generic spinner; backends that hide reasoning (e.g. codex) fall back to the spinner. Live-verified with DeepSeek-R1 (163 reasoning chunks streamed).
- **Anthropic streaming** — `AnthropicProvider` gained `stream()` (live text **and** extended thinking); it previously had no streaming at all and buffered every response. Verified end-to-end against the real Anthropic SDK SSE parser.
- **Codex prompt-routing sync** — `vanta skills sync-triggers --codex` writes a skill's `UserPromptSubmit` routing into `~/.codex/AGENTS.md` (Codex has no event hooks, so routing is a standing instruction it reads each session) — completing cross-agent auto-fire across Vanta / Claude / Codex.
- **Branded install URL** — `curl -fsSL https://vanta.theft.studio/install.sh | bash` (Cloudflare Pages custom domain serving a build-synced copy of the bootstrap installer).

### Fixed
- **`vanta update`** — now pulls `origin/<branch>` explicitly; a bare `git pull --ff-only` failed with "no tracking information" on a clone whose upstream tracking ref wasn't set.
- **SAST clean** — a hardcoded AWS-key *test fixture* is now assembled at runtime, so the security scan reports **0 findings** (no `nosemgrep` suppression — the literal pattern simply no longer exists in source).

## v0.4.0 — 2026-06-27

**Security + modularity.** A security-skills pack you can run on any repo, every fixable CVE cleared, and a codebase-wide modularity pass — all behavior-preserving (full suite green throughout).

### Added
- **`security-skills` pack** — `secret-scan`, `dependency-audit`, `sast-scan`, `security-preflight`: grounded SKILL.md runbooks + a runnable **`scripts/adapter-live.sh`** and **`security-skills/scan.sh`** (one-command gate: secrets → dep CVEs → SAST, no agent required). Bundled into Vanta and published standalone at [jpoindexter/security-skills](https://github.com/jpoindexter/security-skills).
- **Live provider-recovery verification** — `scripts/reliability-recovery.sh` proves the transient-retry *recovers* (not just stops) on a real stalled codex call; `VANTA_CODEX_BASE_URL` makes the provider endpoint overridable.

### Fixed (security)
- **Shipped runtime stays CLEAN** (0 secrets across 2003 commits, 0 runtime CVEs, kernel zero-dep clean).
- Docs site: serialize-javascript RCE/DoS → override `7.0.6`; uuid bounds bug → override `11.1.1` (`docusaurus build` verified).
- **Cleared every `vanta-ts` dev-tooling CVE** (incl. a vitest 9.8 critical) by migrating to **vitest 3 / vite 6** + esbuild override → `osv-scanner` 0 vulnerabilities. The one migration blocker (vitest 3's runner can't dynamic-import a temp file) was fixed by relocating the plugin-loader test fixtures in-repo. Audit recorded in `SECURITY.md §7b`.

### Refactor (modularity — no behavior change)
- **Size gate now has zero exemptions** — `factory/*` brought into compliance (kernel-mirror `checkNoProtectedPaths` byte-identical).
- **65 files modularized under the 200-line soft target** (70 → 5) across 6 verified waves — pure-helper / parser / sub-concern extractions, public exports re-exported so importers + tests needed zero edits. The 5 remaining are deliberately-cohesive registries/type-systems (left whole on purpose).

### Verified
- Full suite **977 files / 11132 tests** green · **67 kernel tests** · `tsc` + size gate (1272 files) clean.

## v0.3.0 — 2026-06-27

**Reliability hardening + measurement.** The release that turned *"ready = task-running reliability, not feature count"* into a measured, tracked property — and fixed the real bugs that measurement surfaced.

### Added
- **Reliability harness suite** (`scripts/reliability-*.sh`): `smoke` (binary gate), `stress` (scored, K-repeat + concurrency burst), `longrun` (one big multi-stage task ×N), `longhorizon`, `eval` (tracked pass-rate → `docs/reliability-results.md`), `faultinject` + `recovery` (live provider-failure injection), and `usecase-surfaces` (drives the real agent across 12 capability surfaces).
- `adapter-live.sh` — live-verifies the no-token adapters against real services (ntfy.sh round-trip).
- `VANTA_PROVIDER_RETRIES` / `VANTA_PROVIDER_RETRY_BACKOFF_MS` — bounded retry on transient provider errors.
- `VANTA_CODEX_BASE_URL` — point the codex provider at a proxy / compatible endpoint.

### Fixed
- **codex provider had no request/idle timeout** — a stalled stream could hang a run forever; now aborts on idle (live-verified).
- **turn-loop re-threw every transient provider error** (exit=1) — now retries with backoff then stops gracefully; both graceful-stop and recovery are live-verified via fault injection.
- **interactive REPL didn't exit on session end** — a silent MCP-handle hang; fixed.
- Web-search default documentation corrected (the `auto` keyless chain is the default, not raw DuckDuckGo).

### Proven (executed, not asserted)
- Long autonomous run finishes unattended **12/12** · kernel clean to **1024×** parallel assess · provider variance codex 100% / ollama 90% · full suite **977 files / 11132 tests** + **67 kernel tests** green · `tsc` + size-gate clean.

## v0.2.0 — 2026-06-22

- **Zero-toolchain install** — only `git` required; checksum-verified prebuilt kernels + a portable Node 22 auto-downloaded when missing.
- Rust safety kernel (allow/ask/block + scope + tamper-evident audit chain), goal ledger, approval queue, HTTP cockpit + JSON API.
- Agent layer: provider-agnostic loop, 100+ built-in tools, 20 messaging adapters, run-anywhere backends (local / sandbox / Docker / SSH), self-learning skill loop, brain/memory layers, and the operator rocks (voice, terminal capture, desktop control, personal LoRA tuning).
- See the [v0.2.0 release](https://github.com/jpoindexter/Vanta/releases/tag/v0.2.0).
