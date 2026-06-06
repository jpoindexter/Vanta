# Vanta TUI — hermes-model.html: shipped

Date: 2026-06-02
Branch: `feat/v1-hermes-parity` (local commits; **no remote configured** — nothing pushed)
Goal: implement every screen + workflow in `docs/hermes-model.html`, fully wired and working.

## What shipped (all 6 mockup screens)

| Screen | Commit | Where |
|--------|--------|-------|
| 1. Startup banner | `4a5399c` | `tui/banner.tsx` — ASCII wordmark + live card (tools, skills, prompt size, MCP servers). Real data, no fabricated numbers. Via Ink `<Static>` (scrolls into native scrollback). |
| 2. Slash palette | (prior `0dcc133`) | `tui/transcript.tsx` `Palette` + `app.tsx` — already shipped; `/model` desc updated. |
| 3. /model picker | `c414540` | `tui/model-picker.tsx` + `model-switch.ts` — two-step wizard (provider → model) + key-entry step, fuzzy filter doubling as free-text, `^g` global/session persist, live hot-swap. **The headline gap.** |
| 4. Status bar | `0810ab0` | `tui/status-bar.tsx` — run state, model, est. context fill + bar, real elapsed time. No fabricated cost. |
| 5. /sessions picker | `cd7112a` | `tui/sessions-picker.tsx` — live/new/saved rows, ⏎ resume/new, `d` delete, Esc close. |
| 6. Approval prompt | `d8ff25f` | `tui/approval.tsx` + `use-approval.ts` — Allow once / session / always-allow `<tool>` / Deny; ↑↓ + 1–4 keys; persists "always" to `~/.vanta/approvals.json`. |

Supporting: `tui/overlay.tsx` (shared shell), `use-overlays.ts` (overlay handlers), `agent.ts` `Conversation.setProvider` (hot-swap primitive).

## Tests: 422 passing / 0 failing (`cd vanta-ts && npx vitest run`), `tsc --noEmit` clean

Interactive overlays are covered by **keypress-driven** tests (ink-testing-library `stdin.write` → assert frame + callback), not just pure logic: arrow→select→action, free-text model entry, `^g` persist, key-step routing, approval quick-keys, Esc.

## What the tests CANNOT prove — verify in a real terminal

The sandbox has no TTY. These need your eyes (`cd ~/Documents/GitHub/Vanta/vanta-ts && npx tsx src/cli.ts`):

1. **Banner** renders correctly (ASCII art alignment, colors, MCP list) and scrolls away after the first turn.
2. **`/model`** → pick a provider → pick/typed model → status bar model updates → **next message actually uses the new model** (the live hot-swap; needs a real key for the target provider).
3. **`^g`** toggles persist; choosing global writes `VANTA_PROVIDER`/`VANTA_MODEL` (+ key) into `vanta-ts/.env` without clobbering other lines.
4. **`/sessions`** → resume a real saved session loads its context; `d` deletes the file.
5. **Approval**: trigger a gated tool (e.g. ask it to `git commit`), confirm the 4-option prompt; "Always allow" then never re-prompts that tool (this session and next launch).
6. Colors/glyphs/focus match the mockup on your terminal + font.

## Notes / decisions

- **No git remote exists** — "push after every step" was honored as **local commits** per step. Say the word to add a GitHub remote and I'll push (the repo references grey-area provider auth + IP notes, so I did not auto-publish).
- **No cost/token usage** is surfaced by providers, so the status bar shows an **estimated** context fill (marked `~`) + real duration; exact usage + cost is a post-ship upgrade.
- **Model lists** in `providers/catalog.ts` are curated, not exhaustive; the free-text filter reaches any model id (OpenRouter 200+, Ollama local).
- **"Always allow"** has no kernel primitive (SafetyClient only has assess + an approve/deny queue), so it persists app-side; the kernel still records each approve/deny.
- Parked: live model listing via provider `/models`, `^d` disconnect in the picker, transcript scroll (stock-Ink limit — P7).
