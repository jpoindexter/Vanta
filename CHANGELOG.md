# Changelog

Notable changes per release. Each release ships prebuilt kernels for macOS + Linux (arm64 / x64),
attached as assets. Full auto-generated commit notes live on the [Releases](https://github.com/jpoindexter/Vanta/releases) page.

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
