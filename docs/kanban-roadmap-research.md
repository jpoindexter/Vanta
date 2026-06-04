# Research: should the roadmap be a kanban board Argo + I both control?

**Question (goal):** "maybe roadmap is a kanban board u and argo can control — figure out the best thing."

**Short answer: it already IS a kanban — finish the job, don't rebuild it.** Make the existing `roadmap.json` board bi-directionally live, and add a WIP limit. The WIP limit is the point: it's the executive-function prosthesis for the documented bounce/over-scope pattern.

## What already exists (don't rebuild)

- `roadmap.json` — agent-ready source of truth, git-versioned. `status` enum (`shipped`/`building`/`next`/`horizon`) **is already the column model.**
- `roadmap.html` via `src/roadmap/render.ts` — **already renders a 3-column kanban**: Now (building) · Next · Later (horizon), grouped by track. It's just **read-only** (you hand-edit JSON, regenerate).
- `argo roadmap` command builds + opens it. Argo already **reads** the board natively.
- Argo can already **write** `roadmap.json` (write_file, kernel-gated) — it just has no clean "move card" verb.
- Kernel runs a local HTTP server (cockpit + `/api/*`) — a reuse option for serving an interactive board.

So the gap is narrow: (1) the human can't move a card without editing JSON; (2) Argo has no first-class "move card" action; (3) no WIP discipline.

## Options considered

| Option | Verdict | Why |
|---|---|---|
| **A. Keep JSON + add Argo move-verb + make html interactive (write-back) + WIP limit** | **RECOMMENDED** | Reuses everything; source stays agent-ready/git-versioned; smallest new surface; the WIP limit makes it an EF tool, not just a tracker. |
| B. External board (GitHub Projects / Linear / Trello) synced via API | DROP | External dep + auth; abandons agent-ready/local/git-versioned; can't enforce a WIP limit as an EF intervention; platform-thinking before users. |
| C. TUI kanban view in the Ink app | DEFER | Nice later, but the html board already exists — make it live first. |
| D. Brand-new board app/DB | DROP | Over-engineering; ignores the working roadmap.json+render pipeline. |

## Recommendation (the best thing) — evolve, in this order

1. **Argo control — `roadmap_move` tool + `argo roadmap move <id> <status>`** (kernel-gated write to `roadmap.json` → regenerate html). Argo moves cards as it works; the dark factory moves a card `next→building` on start and `building→shipped` on verified-commit. Closes the loop between the autonomy ladder and the board. *(size S)*
2. **Human control — interactive board.** Make `roadmap.html` drag-to-move; a card drop POSTs to a tiny local endpoint (`argo roadmap serve`, or kernel `/api/roadmap/move`) that rewrites `roadmap.json` + regenerates. Both parties mutate one source of truth. *(size M)*
3. **The EF feature — WIP limit on "Now" (building) = 1–2.** Trying to move a 3rd card into Now **refuses and asks you to finish or park one.** This is the anti-bounce / finish-what-you-start prosthesis — kanban's WIP limit is *why* kanban is the right model here (a list has no WIP limit). Directly targets the documented pattern (ideas-rich, finish-poor) and this session's live bounce (8 goals). *(size S)*

Calm (F3): Now shown prominently, Later collapsed — one active thing, visible. ND fit across the build: F2 (externalized shared state), F4 (one decision: what's Now), F5 (structure/follow-through), F6 (Argo + human see the same truth).

**Anti-drift note:** ship #1 (Argo move-verb) first as the smallest end-to-end slice; #2 and #3 follow. Don't build all three before one works. Captured as roadmap item `KANBAN` (one card — dogfooding the WIP discipline).
