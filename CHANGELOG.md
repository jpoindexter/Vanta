# Changelog

Notable changes per release. Each release ships prebuilt kernels for macOS + Linux (arm64 / x64),
attached as assets. Full auto-generated commit notes live on the [Releases](https://github.com/jpoindexter/Vanta/releases) page.

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
