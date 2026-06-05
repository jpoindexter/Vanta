# Claude Code parity + the desktop-handoff case study

> Sources (2026-06-05): the desktop interface handoff + completion plan, and the
> "mirror Claude Code harness functionality, find the delta" goal. The desktop
> build plan itself is captured in `docs/desktop-completion-plan.md` and as
> `DESKTOP-P0..P12` in `roadmap.json`.

## Part 1 — Case study: the logic failures (not just the UI bugs)

Jason called the desktop chat "a good case study." The *reasoning* mistakes matter
more than the individual UI gaps — they're behavioral and will repeat unless fixed:

1. **Reference-blindness.** Told "build something like hermes-agent but better," Argo
   built a generic dashboard *without inspecting Hermes first*. Lesson → **`REF-FIDELITY`**:
   "like X but better" means inspect X's actual structure/interaction model first,
   reproduce it, *then* improve + brand. (Argo's brain already saved this; make it a rule.)
2. **Proxy verification.** Argo claimed "2 tests pass, typecheck clean" as if that proved
   the work. It proves TS *compiles* — not that the UX matches the reference or runs.
   Lesson → **`VERIFY-RIGHT`**: verification must target the *actual claim*. For UI/behavior,
   run it and observe; "it compiles" is not "it works." (Pairs with `TRUST-LABELS`.)
3. **Premature done.** Each pass claimed success while "still very incomplete." Success
   asserted before the thing was real. (Pairs with `BETTER-ENDINGS` + verify-before-claim.)
4. **Left work uncommitted.** The desktop work was never committed — it took a handoff
   file to recover it, and it left HEAD importing an unexported symbol (a real broken-build,
   fixed in `2377586`). Pairs with the standing "commit on slice complete" rule.
5. **Wall-of-text / shows-all-thinking output.** The chat dumped raw reasoning + full tool
   output. Should be collapsible + clean like Claude Code. Lesson → **`THINK-FOLD`** (thinking)
   + **`CC-TRANSCRIPT`** (tool calls).
6. **Built blind.** Never ran the app and *looked* at it against the reference — no visual
   check. Pairs with `VERIFY-RIGHT` (observe the real surface).

These become durable operating rules, not one-off corrections.

## Part 2 — Claude Code → Argo capability delta

What the Claude Code harness does ("what you do") vs what Argo has. **Argo already has
most of it** — the genuine gaps are clickability and clean transcript structure.

| Claude Code capability | Argo today | Gap → item |
|---|---|---|
| Clickable `file:line` refs (open in editor) | plain text | **`CC-LINKS`** + **`CC-EDITOR`** |
| Clickable URLs / links | plain text | **`CC-LINKS`** |
| Collapsible tool calls (1-line summary, expand) | dumps full output | **`CC-TRANSCRIPT`** |
| Live todo / progress checklist (TodoWrite) | goals/EF, no live checklist | **`CC-TODO`** |
| Collapsible thinking display | TUI-THINK (shipped) | `THINK-FOLD` (captured) |
| Streaming tokens + tool events | TUI streams; desktop doesn't | `DESKTOP-P1` (SSE) |
| `@file` references + autocomplete | ✅ U2 @-context | — |
| Slash commands | ✅ shipped | — |
| Diff rendering for edits | ✅ TUI-DIFF | — |
| Image paste / drag-drop | ✅ `/paste`, drag-drop | — |
| Permission/plan modes | ✅ TUI-MODE, `/planmode` | — |
| Status line (model/tokens/ctx) | ✅ TUI-STATUS | — |
| Vim mode | ✅ TUI-VIM | — |
| MCP (use/make/serve) | ✅ MCP-1/2/3 | — |
| Memory (`#` to remember, CLAUDE.md) | ✅ brain + `#` prefix | — |
| Hooks | ✅ Claude Code hooks | — |
| Background/parallel agents | ✅ swarms/delegate | — |

**The real delta = clickability + transcript structure**, exactly Jason's example ("click
links, files, etc — Argo can't"):
- **`CC-LINKS`** — emit terminal **OSC-8 hyperlinks** for URLs + `file:line` in the TUI, and
  real anchors in the desktop, so they're clickable.
- **`CC-EDITOR`** — open a `file:line` in the user's editor (`$EDITOR` / `code -g` / an
  `argo open` command; the desktop app does it natively). Argo has LSP tools but no
  open-in-editor bridge.
- **`CC-TRANSCRIPT`** — collapse each tool call to a one-line summary (tool + key arg +
  status), expandable; stop flooding the screen. The structural fix behind the "verbose"
  complaint.
- **`CC-TODO`** — a live, updating task checklist (Claude Code's TodoWrite) so Jason sees
  progress without reading a wall of prose.

## Part 3 — Desktop app

The desktop interface exists but is a rough web shell. The completion plan
(`docs/desktop-completion-plan.md`) lays out **13 phases → `DESKTOP-P0..P12`**, Electron-first
for Hermes parity, kernel-enforced everywhere. Build order is P0 (refactor+tests) → P1
(SSE streaming) → P2 (session runtime map) → P3 (React renderer) → P4 (approval) → P5–P11
(model/files/terminal/preview/palette/center/composer) → P12 (native packaging, after UX is
approved). **Hard rule kept from Jason: not a generic dashboard — match Hermes's interaction
model first, then apply Argo's operator/dossier aesthetic + safety kernel.**
