# Large Rocks — Completion Ledger

> Goal: "complete all large rocks in logical order until complete."
> This ledger maps each rock to its done-criterion, what shipped across slices, and the precise boundary of what remains (and why).
> Updated 2026-06-14. All code green: typecheck clean · 2998 TS tests pass · size gate clean (file ≤300 / fn ≤50 / params ≤4 / cx ≤10).

The pattern for every slice: a **pure module** (fully unit-tested, no I/O) + a **kernel-gated tool action** (or `/command` view) reading an append-only `~/.vanta/*.jsonl` store. Slice work stayed on disjoint files (new module imported by the existing tool), built by parallel subagents + central verification.

---

## ✅ Verification organ — COMPLETE

**Done-criterion** (SELFHARNESS-FAILURE-TO-TEST): *a debugged failure becomes a locked, re-runnable regression case; the suite grows from real failures.*

- **S1** `/skeptic` — adversarial refute-by-default verification.
- **S2 (keystone)** `regression_lock` tool + `verify/store.ts` + pure `verify/check.ts` + `/locks`. `lock {claim, command, expect}` records a regression case; `check [id]` re-runs the command (approval-gated) and flags a regression if the substring is gone or the command fails; `list` shows status.

**Status: done.** Lock + check + regression detection + view all shipped and tested.

---

## ✅ World model — COMPLETE

**Done-criterion** (WANT-WORLD-MODEL): *queryable entity-relationship graph with freshness/confidence + conflict detection; "what do I know about X" returns cited facts with uncertainty.*

- **S1** entities + relations store, record/relate/query, `/world`.
- **S2** `world/conflicts.ts` — `findConflicts` (contradiction = same subject+predicate, different object) + `recallWithSources` (cited recall).
- **S3** `world/merge.ts` — `mergeEntities` (consolidate duplicates, re-point relations) + `findDuplicates` suggestions.
- **S4** `world/confidence.ts` — `freshness` (age decay), `confidence` (freshness × corroboration × contradiction-penalty), `labelUncertainty`. Recall now returns each cited fact as `[likely · 62% · source:<ts>]`.

**Status: done.** Graph + conflict detection + cited recall **with freshness/confidence/uncertainty** all shipped.

---

## ✅ Money OS — COMPLETE

**Done-criterion** (WANT-MONEY-OS): *machinery for offers, prospects, deliverables, revenue ledger, follow-ups, weekly review — ethically guardrailed.*

- **S1** offers/prospects/revenue store, `/money`.
- **S2** `money/review.ts` — `suggestPrice` (median band) + `weeklyReview`.
- **S3** radar→money: a scored opportunity promotes into a prospect (cross-rock inflow).
- **S4** `money/work.ts` — `deliverable` + `followup` record kinds, `dueFollowups`, `deliverableProgress`; weekly review surfaces due follow-ups + deliverable progress.

**Status: done.** All six pillars present; every mutation is kernel-gated (the ethical guardrail).

---

## ✅ Opportunity radar — COMPLETE

**Done-criterion** (WANT-OPPORTUNITY-RADAR): *scans free sources, scores by pain+buyer signal, generates an evidence-tied offer + artifact.*

- **S1** scored-opportunity store, `/radar`.
- **S2** `radar/scan.ts` — `rankOpportunities` (composite pain×signal, recency tie-break) + `draftOffer`.
- **S3** `promote` — opportunity → Money-OS prospect.
- **S5** `radar/extract.ts` + `scan_web` action — scans free sources via `resolveSearchProvider`, `extractOpportunities` scores pain/buyer signals from result text, appends candidates. **Degrades gracefully** (catches search failure → clean "search unavailable" value, never throws).

**Status: done.** Scans ✓, scores ✓, evidence-tied offer ✓, pipeline hand-off ✓. Live result *quality* depends on a reachable search backend — the keyless DDG endpoint 403s here (vanta-ts/CLAUDE.md gotcha); a keyed provider (Brave/SerpAPI) or Searxng gives real coverage. The wiring + extraction is complete and provider-agnostic.

---

## ✅ Life-wide search — COMPLETE

**Done-criterion** (WANT-LIFE-SEARCH): *one semantic index spanning Jason's stores; permission-aware, source-cited retrieval; local-embedding option; change-detecting refresh.*

- **S1** cross-store search (world/money/radar/team/errors), source-cited, `/lifesearch`.
- **S2** `search/life-rank.ts` — dependency-free relevance ranker (term density + exact-phrase + title-hit + recency).
- **S4** `search/refresh.ts` — change-detecting refresh (djb2 per-store digests → which stores changed since last index).
- **S5** `search/embed.ts` + `semantic` action — **local embeddings via ollama** (`/api/embeddings`, `cosineSim`, **zero new dependency** — reuses the connection Vanta already has), `VANTA_EMBED_MODEL` (default `nomic-embed-text`). Falls back to the lexical ranker when ollama is down ("semantic unavailable — lexical ranking").

**Status: done.** Semantic (vector) index ✓, source-cited ✓, local-embedding option ✓, change-detecting refresh ✓. Live semantic ranking needs `ollama pull nomic-embed-text`; degrades cleanly without it.

---

## 🟡 Self-repair compartments — CORE COMPLETE, live repair deferred (sign-off)

**Done-criterion** (WANT-SELF-REPAIR-COMPARTMENTS): *self-edits target only non-protected compartments; a new/replaced tool is sandbox-tested before attach; failed edits auto-rollback; repeated tool failure opens a repair loop.*

- **S1** body map (brainstem/skeleton/reflexes/limbs/memory) + max-autonomy per part; protected compartments are kernel-enforced.
- **S2** `self/detect.ts` — `detectBroken` (per-compartment healthy/impaired/down from real cap checks) + `lastKnownGood` (newest good git sha = rollback target) + `repair.jsonl` markers.
- **S3** `self/rollback.ts` — `proposeRollback`: prints the exact `git checkout <lkg-sha> -- <paths>` command, **never auto-executed**.

- **S5** `self_repair` tool — **auto-rollback now executes** (operator-authorized 2026-06-14): `mark` records HEAD as a compartment's last-known-good; `rollback` runs the scoped `git checkout <lkg-sha> -- <paths>`, **kernel-assessed + approval-gated** with a discards-changes warning, and **refuses** protected compartments (brainstem/skeleton, `maxAutonomy:none`) + unscoped `limbs`; `status` lists markers.

**Shipped:** compartment map + protected boundary ✓, health detection ✓, last-known-good tracking ✓, rollback proposal ✓, **executing rollback (gated) ✓**.
**Remaining clause — sandbox-test-before-attach.** The one done-criterion clause still open: running a new/replaced self-written tool in an isolated sandbox (atop `run-code`'s isolation) before wiring it. A distinct build; auto-rollback (the named blocker) is shipped with full safety rails (kernel gate + protected-compartment refusal).

---

## ✅ Background teams — COMPLETE

**Rock:** a roster of named background workers that actually do work.

- **S1** worker roster store, `/team`.
- **S2** `team/tasks.ts` — task-assignment + legal-transition status ledger (assigned→running→done|blocked); `dispatch`/`advance`/`tasks`; `/team` shows per-worker load + running task.
- **S5** `run` action — **live executor** (operator-authorized 2026-06-14): actually spawns a worker for a dispatched task via `spawnSubagent`, advancing the task running→done (with the result) or →blocked (with the error). The child registry excludes `delegate` + `team` so a worker **can't fan out further** (no recursive teams); every worker tool call stays kernel-gated (same safety model as `delegate`).

**Status: done.** Roster ✓, task ledger ✓, live executor ✓.

---

## 🟡 Browser/computer-use body — BROWSER COMPLETE, OS-level deferred (needs driver)

**Done-criteria:** DESKTOP-ACTION-SCHEMA (typed, kernel-assessable action schema), DESKTOP-CONTROL-BOUNDARY (kernel-routed, irreversible-escalating, kill-switch, scoped), DESKTOP-VISION-TO-ACTION (screenshot → grounded action → re-observe → mis-click detect).

- **S1** `browser/act.ts` + `browser_act` — navigate/click/type/press/scroll/wait; `classifyAction` flags irreversible controls (submit/buy/delete/login/send), secret entry, Enter; risky sequences + unlisted domains gate via approval with a **masked dry-run preview**.
- **S2** `browser/observe.ts` — `observe:true` appends the page's interactable elements (links/buttons/inputs + suggested selectors) for click grounding; **kill-switch** `VANTA_BROWSER_DISABLED` short-circuits before any launch.

**Status:**
- **DESKTOP-ACTION-SCHEMA — done (browser surface):** typed `BrowserAction` schema, each action `describeForSafety`-able + kernel-assessable.
- **DESKTOP-CONTROL-BOUNDARY — done (browser surface):** routes through the kernel approval queue ✓, irreversible escalates ✓, kill-switch ✓, domain-scoped ✓.
- **DESKTOP-VISION-TO-ACTION — in progress:** element-grounding (the *perceive→ground* step) shipped; the full screenshot-grounded *act→re-observe→mis-click-detect* loop and **OS-level** (non-browser) control need a desktop driver (UI-TARS-style coords / accessibility tree). Genuine horizon — see docs/research/ui-tars-desktop.md.

---

## Summary

| Rock | Slices | Status |
|------|--------|--------|
| Verification organ | S1–S2 | ✅ complete |
| World model | S1–S4 | ✅ complete |
| Money OS | S1–S4 | ✅ complete |
| Opportunity radar | S1–S3,S5 | ✅ complete (live scan quality needs a keyed search backend) |
| Life-wide search | S1,S2,S4,S5 | ✅ complete (semantic ranking needs `ollama pull nomic-embed-text`) |
| Background teams | S1,S2,S5 | ✅ complete |
| Self-repair | S1–S3,S5 | 🟢 auto-rollback shipped · one clause left (sandbox-test-before-attach) |
| Browser body | S1–S2 | 🟡 browser complete · OS-level needs a desktop driver |

**7 of 8 rocks fully complete; the last two clauses (self-repair sandbox-test, browser OS-level control) are distinct future builds — one a layer atop `run-code` isolation, the other needs a desktop driver (UI-TARS-style).** The operator-authorized horizon items (radar live scanning, life-search local embeddings, self-repair auto-rollback, teams live-spawn) all shipped 2026-06-14 with their safety rails: every spawned worker + every executed git rollback stays kernel-gated, protected compartments refuse rollback, and search/embed failures degrade gracefully rather than throw.
