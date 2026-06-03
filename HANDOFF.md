# Argo — Session Handoff (2026-06-03 v2)

Cold-start context for a fresh thread. Read this + `MANIFESTO.md` + `ROADMAP.md` first.

---

## Where things are

- **Repo:** `~/Documents/GitHub/Argo` (Rust kernel `src/*.rs`; TS agent `argo-ts/`).
- **Branch:** `feat/v1-hermes-parity` — **in sync with origin, clean tree.**
- **Tests:** 512 TS (vitest) + 21 Rust green; `tsc --noEmit` clean.
  - Run: `cd argo-ts && npx vitest run && npx tsc --noEmit` · `cd .. && cargo test`
- **Gotcha:** harness pins spawned cwd to old `Nexarion Agent` path. Real repo is `Argo/`. `ARGO_ROOT` env var is the fix — the TS launcher always passes it.

## Source-of-truth docs

- `MANIFESTO.md` — north star, 8 hard lines, non-negotiable.
- `ROADMAP.md` — v1.1–v1.5 + SHIPPED + RESIDUAL.
- `DECISIONS.md` — locked choices (append-only).
- `docs/superpowers/specs/2026-06-03-o9-dark-factory-design.md` — **approved O9 design spec** (committed + pushed).
- `argo-ts/CLAUDE.md` + `argo-ts/AGENTS.md` — file map + env + tool-add checklist.

---

## O9 plan: mid-flight (resume this first)

**Design is approved and committed.** The implementation plan has NOT been written yet — was interrupted by the bug report below.

Resume with: `superpowers:writing-plans` skill, pointing at `docs/superpowers/specs/2026-06-03-o9-dark-factory-design.md`.

**Critical sequencing (from spec + advisor review):**
1. **Slice 1 — kernel `is_protected_path` (Rust)** — new rule in `src/safety.rs`: in-root-but-forbidden paths. Tested in Rust. Everything else depends on this.
2. `factory/triage.ts` — local-model backlog analysis from concrete inputs.
3. `factory/verifier.ts` — the anti-self-faking gate (new test must fail on old code).
4. `factory/executor.ts` — swarm dispatch + per-slice CLAUDE.md/AGENTS.md update.
5. `factory/planner.ts` + `factory/run.ts` — orchestrator, lock, budget.
6. CLI wiring — `argo improve` + gateway-spawned child process.

Plan goes to: `docs/superpowers/plans/2026-06-03-o9-dark-factory-plan.md`.

---

## Bug report: 4 issues from live session (root-cause complete — fix next)

Jason ran a live session (`/Users/jasonpoindexter/Desktop/argo_log.rtf`). Three things failed; one is a misleading agent message. All root-causes are confirmed against the actual code. Ready to implement — no more investigation needed.

### Bug 1 — Dropped file path with leading `/` treated as slash command (readline REPL)

**Evidence:** log line 590: `unknown command /Users/jasonpoindexter/Desktop/argo_visual_test.mov — /help for the list`

**Root cause:** `argo-ts/src/interactive.ts:167`:
```ts
if (line.startsWith("/")) {   // ← intercepts dropped absolute paths first
  const result = await executeSlash(line, ctx);
  ...
  continue;                   // never reaches runUserTurn → maybeDroppedImage
}
```
`runUserTurn` at line 129 already calls `maybeDroppedImage(text)` — but the slash guard fires first for any path starting with `/`.

**The TUI (`app.tsx:203-207`) already fixes this correctly** — it calls `maybeDroppedImage` before the slash check. The readline REPL doesn't.

**Fix:** In `interactive.ts`, before the `startsWith("/")` guard, call `maybeDroppedImage(line)`. If it returns an attachment, push to `state.pendingImages` and continue to `runUserTurn("Take a look at this image.")` without hitting the slash path.

```ts
// BEFORE the slash guard:
const dropped = await maybeDroppedImage(line);
if (dropped) {
  (state.pendingImages ??= []).push(dropped);
  await runUserTurn("Take a look at this image.");
  continue;
}
if (line.startsWith("/")) { ... }
```

**File:** `argo-ts/src/interactive.ts` (line ~167).

---

### Bug 2 — Video extensions not handled in drop/drag flow (both REPL and TUI)

**Root cause:** `argo-ts/src/repl-commands.ts:32`:
```ts
if (!/\.(png|jpe?g|gif|webp)$/i.test(s)) return null;  // .mov|.mp4 → null
```
`maybeDroppedImage` only matches image extensions. Dropped `.mov`, `.mp4`, `.webm`, `.mkv` files return `null` everywhere — REPL and TUI both call this function.

**Fix:** Add a parallel `maybeDroppedVideo(input)` in `repl-commands.ts` that:
- Matches `\.(mov|mp4|webm|mkv|avi)$/i`
- Checks the path exists
- Returns the path string (not a buffer — `watch_video` takes a path)

Wire it in **both**:
- `interactive.ts` — before the slash guard (alongside the image check above)
- `tui/app.tsx:203-207` — in the drop handler

When a video is dropped: auto-send `watch_video` with the path and prompt "Describe what's in this video."

**Files:** `argo-ts/src/repl-commands.ts`, `argo-ts/src/interactive.ts`, `argo-ts/src/tui/app.tsx`.

---

### Bug 3 — `look_at_screen` gives cryptic error on Screen Recording permission denial

**Evidence:** log:
```
✗ look_at_screen: look_at_screen failed: Command failed: screencapture -x /var/folders/...
could not create image from display
```

**Root cause:** `argo-ts/src/tools/look-at-screen.ts`. When macOS hasn't granted Screen Recording permission, `screencapture -x` **throws** (doesn't silently write an empty file). The useful hint (`"macOS only; grant Screen Recording permission to the terminal"`) is in the `if (!buf.length)` branch — which is never reached because exec already threw.

The generic `catch(err)` just re-emits the raw OS error.

**Note:** The second attempt in the log **succeeded** — macOS prompted the user for permission after the first failure. So this isn't a hard block. The fix is just a better first-run error message.

**Fix:** In the `catch` block, detect the known macOS permission error string:
```ts
} catch (err) {
  const msg = (err as Error).message;
  if (/could not create image/i.test(msg)) {
    return { ok: false, output: "look_at_screen needs Screen Recording permission — open System Settings → Privacy & Security → Screen Recording and enable your terminal, then try again." };
  }
  return { ok: false, output: `look_at_screen failed: ${msg}` };
}
```

**File:** `argo-ts/src/tools/look-at-screen.ts`.

---

### Bug 4 — Agent incorrectly says "file access is scoped to Argo folder" when drag-drop works

**Evidence:** In the log, Jason pasted a Desktop image path. The agent replied:
> "I can't directly read `/Users/jasonpoindexter/Desktop/...` from here because file access is scoped to the Argo project folder."

**Root cause:** This is misleading. The `read_file` tool and `describe_image` tool do scope-check paths. But **drag-drop bypasses this entirely** — `maybeDroppedImage` in `repl-commands.ts` calls `fs.readFile` directly (not via the tool layer), so Desktop images DO work when dragged in. The agent was confused because Jason had typed the path rather than dragged it.

**Fix:** Update the agent prompt / SOUL.md to add a rule: "When a user provides an image path, do not tell them it's out of scope — instead, tell them to use `/image <path>` (which bypasses scope) or drag the file into the terminal (which also works). The `read_file` tool is scope-restricted, but the image attachment pipeline is not."

Also update `/help` output to more prominently explain `/image <path>`, `/paste`, and drag-drop.

**File:** `argo-ts/src/prompt.ts` or `SOUL.md` (one-line rule addition), `argo-ts/src/repl-commands.ts` (help text for `/image`).

---

## Model guidance for this session (Claude Code)

**Opus 4.8** — for design + hairy debugging. Proved its value: caught the kernel-vs-TS enforcement gap in O9 that would have made the safety model advisory-only.

**Sonnet 4.6** — for mechanical implementation. The 4 bugs above are fully root-caused; implementing them is TDD typing. The O9 plan-writing is structured work, not reasoning-heavy. Sonnet is fine for both.

**Rule:** Opus when reasoning is the bottleneck, Sonnet when typing is. Switch back to Opus for the O9 kernel `is_protected_path` Rust slice (subtle, load-bearing) and any new debugging.

Avoid over-switching mid-thread — each model switch re-reads the full context cache (costs ~300s TTL penalty).

---

## Startup banner model mismatch (low priority, cosmetic)

The session log showed `qwen2.5:14b` in the startup banner but `gpt-5.5` after `/model`. This is expected: the banner is a one-time snapshot at session start using `ARGO_MODEL` from `.env` (qwen2.5:14b = the Ollama default). After `/model → gpt-5.5`, the status bar updates live but the static banner doesn't. Not a bug — just potentially confusing on first run.

Minor fix if desired: remove the model from the static banner (it's in the live status bar). Or add "(session start)" label to the banner model. Low priority.

---

## Recommended next actions (in order)

1. **Write the O9 implementation plan** (`writing-plans` skill, spec is at `docs/superpowers/specs/2026-06-03-o9-dark-factory-design.md`).
2. **Fix the 4 bugs** — all root-causes confirmed, no investigation needed.
3. **Build O9 slice 1** — kernel `is_protected_path` Rust function + tests.

Goals in the kernel ledger (`.argo/goals.tsv`):
- #1: Ship Argo v0 agent loop *(done, mark complete)*
- #2: Ship O9 dark-factory (review-mode v0)
- #3: Read argo_log.rtf, diagnose + fix bugs

## Gotchas that'll bite

- `argo-ts/src/tools/tools.test.ts` has a sorted list of all registered tool names — add a new tool's name there or the test fails.
- Import cycles with `tools/index.ts` — if a new tool imports `buildRegistry`, use a lazy import (see `swarm.ts`).
- Stale binary on :7788 from old `nexarion-agent` name — `lsof -nP -iTCP:7788 -sTCP:LISTEN` and kill.
- `~/Documents/GitHub/Nexarion Agent/` is an empty harness artifact — real repo is `Argo/`.
