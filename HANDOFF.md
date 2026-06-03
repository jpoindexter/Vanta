# Argo — Session Handoff (2026-06-03)

Cold-start context to resume work in a fresh thread. Read this + `MANIFESTO.md` +
`ROADMAP.md` first.

## Where things are
- **Repo:** `~/Documents/GitHub/Argo` (Rust kernel at root `src/*.rs`; TS agent in `argo-ts/`).
- **Branch:** `feat/v1-hermes-parity` — **in sync with origin, clean tree.** NOT merged/PR'd (long-lived feature branch; every slice was committed + pushed).
- **Tests:** `512 TS (vitest) + 21 Rust` green; `tsc --noEmit` clean. Run: `cd argo-ts && npx vitest run && npx tsc --noEmit`; `cd .. && cargo test`.
- **Gotcha:** the harness pins spawned cwd to the old `Nexarion Agent` path — real repo is `Argo`; the TS launcher passes `ARGO_ROOT`. Don't trust `pwd`.

## Source-of-truth docs (read these, don't re-derive)
- `MANIFESTO.md` — north star (the agent built to surpass Hermes; 8 hard lines; neurodivergent-first).
- `ROADMAP.md` — v1.1–v1.5 + **"ALSO SHIPPED"** + **"RESIDUAL"** blocks (what's left).
- `DECISIONS.md` — locked choices (Codex-OAuth reversal, kernel-safety, claude-code provider).
- `docs/parity-audit.md`, `docs/claude-cli-gaps.md`, `docs/hermes-issues-map.md` — gap analyses.
- `argo-ts/CLAUDE.md` — "Session additions" section = current file/feature map.
- **Hermes reference (customized, primary):** `~/.hermes/hermes-agent/` (vs `~/.hermes/hermes-agent-clean/` = diff is Jason's fixes). Public repo `~/Documents/GitHub/_active/hermes-reference` is secondary. Commands registry: `hermes_cli/commands.py`. Genesis transcript: `docs/_hermes-recon/`.

## What shipped (this 2026-06-02/03 marathon)
Providers (Codex ChatGPT-OAuth via `~/.codex/auth.json`, gemini, openrouter, claude-code) · native multimodal (image paste/drag-drop) · senses (`look_at_screen`, `look_at_camera`, `watch_video`, `speak`/TTS, `transcribe`/STT — all via the ACTIVE provider) · `delegate` model-choice + `swarm` (parallel agents) · **brain** (`~/.argo/brain/`, 7 regions, self-grown) + `brain` tool + `/memory` · skill-index injection + recall-body + volatile skills + `skills lint` · `todo`+`/plan` · capped memory · **kernel safety hardened** (Hermes #36846/#36645 bypasses closed) · real token usage · UX commands (`/goal /history /retry /undo /reset /title /fork /usage /copy /update /compress /context /mcp /export /attachments /image /paste`) · queued input · notifications · frugality + continuous-self-improvement directives · `bootstrap.sh` installer.

## RESIDUAL (not done — by design)
1. **O9 — self-improving-codebase "dark factory"** (highest-value next). An *autonomous self-modifying loop*. All pieces exist (hardened kernel, verified-output, delegate/swarm, run_code, git tools, brain, gateway daemon E1 + cron). **Missing: the driver loop + stopping conditions + safety review.** Do this with a real design pass (brainstorm → plan → build under review) — it's the one feature where "move fast" is dangerous (it edits its own code). Don't bolt it on.
2. **B-v2 — emergent self-designed brain** (research).
3. **Polish tier:** `@`-file mentions (composer autocomplete) · themes/output-styles · `/vim` · multi-dir `/add-dir` · #37070 cron-output awareness · S4 skill-versioning-on-write.

## Key facts / gotchas for the next session
- **Vision/eyes** use `resolveProvider(process.env)` (active model), NOT hardcoded OpenAI — works on gemini/codex. Don't reintroduce an OPENAI_API_KEY requirement.
- **Codex auth:** reads/refreshes `~/.codex/auth.json` and **writes rotated tokens back** (refresh_token rotates → shared lineage keeps the Codex CLI working). Don't switch to a private store.
- **macOS-only tools** (need the binary; degrade with a clear error): `say`, `screencapture`, `imagesnap`, `ffmpeg`, `whisper` (`pip install openai-whisper`), `pbcopy`/`osascript`.
- **Adding a tool:** register in `argo-ts/src/tools/index.ts` AND add the name to the sorted list in `src/tools/tools.test.ts` ("registers all tools" asserts the full set). Watch for **import cycles** with `tools/index.ts` (lazy-import `buildRegistry` if needed — see `swarm.ts`).
- **Convention:** every slice = real code + co-located test + `tsc` clean + one commit + **push** (Jason's standing rule: push 100%, don't skip).
- One integration test (`agent.test.ts`, live kernel) self-skips when the kernel is down; occasionally flaky under load — re-run to confirm.

## Verify / run
`./install.sh` then `argo` → TUI on a TTY. `/model` → pick **Codex (sub)** (gpt-5.5) or Gemini. Try `/goal`, `/plan`, drag an image in, `/usage`.

## Recommended next action
Start **O9** with a design session — it's the keystone of Jason's vision ("a dark factory but AI agent that always follows the non-destructive rules"). Brainstorm the autonomous loop + guardrails + stopping conditions first; then plan; then build under the kernel's hard lines. Fresh thread recommended (the prior thread was very long). Standing directive from Jason: keep building the backlog top-down, commit + push every slice, don't stop.
