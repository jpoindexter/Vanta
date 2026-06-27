# Changelog

Notable changes per release. Each release ships prebuilt kernels for macOS + Linux (arm64 / x64),
attached as assets. Full auto-generated commit notes live on the [Releases](https://github.com/jpoindexter/Vanta/releases) page.

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
