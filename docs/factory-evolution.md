# Dark-factory evolution — born-small codegen + validation hardening

Research + independent assessment from studying five external "software factory" references
(OctopusGarden, StrongDM's Software Factory, Simon Willison's writeup, Ouroboros, Dan Shapiro's
Five Levels) against Argo's own dark factory. **Adapt the ideas, never copy the code.** Roadmap
items derived below are tracked as `FAC-*`.

## The decisive distinction

Every external reference builds **new** software from specs (greenfield, spec→app). **Argo improves
its OWN existing codebase (brownfield self-modification).** That filter decides what transfers — and
it's the reason Argo is *ahead* on the one problem none of them face (self-modifying the factory/kernel).

## Independent assessment — use / can't / missing / cut

### USE (adapt)
- **Holdout author-separation** — the agent that writes a fix must not author its own acceptance check.
  Argo's "new test must fail on old code" is a *partial* holdout; the hole is that the same cycle writes
  code + test (can write a weak test). Adapt: a separate, implementation-blind agent (or a pre-existing
  scenario) authors/judges acceptance. → `FAC-HOLDOUT`.
- **Intent-satisfaction LLM-judge** — *the biggest concrete gap.* The verifier proves code is CORRECT
  (tests/tsc) but never that it DID WHAT THE ITEM ASKED. A slice can pass every test and not fulfill the
  roadmap item. Boolean for deterministic checks; LLM-judged only for intent. → `FAC-INTENT`.
- **Ambiguity-gated preflight (lightweight)** — don't burn a cycle on a too-vague item; clarify or skip.
  Unifies with the ND `ND2 clarify` / `ND3 plan-first` items — one mechanism, both surfaces. Take the
  *gate*, not Ouroboros's ceremony. → `FAC-PREFLIGHT`.
- **Model escalation + per-cycle cost ledger** — answers Willison's ~$1k/day caution; serves frugality.
  Argo has token budgets but no escalation or cost accounting. → `FAC-ESCALATE`.
- **Stall recovery / bounded-retry** — replace discard-on-fail with bounded iterate + strategy switch
  (Ouroboros spinning/oscillation/diminishing-returns; OctopusGarden wonder→reflect). → `FAC-STALL`.
- **Work-item closure loop** — when the factory ships an item, close it (tick the checkbox / move the
  KANBAN card), not just commit code. Ties to the `KANBAN` item. → `FAC-CLOSE`.
- **Gene transfusion** — scan an exemplar → extract a pattern guide → inject as "PROVEN PATTERNS (spec
  wins on conflict)". This is the born-small mechanism. → `FAC-BORNSMALL`.
- **Five-Levels** — positioning only (Argo's autonomy ladder L1–L5 already mirrors L0→L5). Audit/manifesto.

### CAN'T USE / CUT (deliberately not building)
- **Digital Twin Universe** — irrelevant to self-improvement (Argo isn't validating against Okta/Slack
  clones). CUT (marginal only for comms tools).
- **Probabilistic scoring on deterministic gates** — boolean is *correct* for "did the build break?".
  Keep boolean; reserve LLM scoring for subjective intent only.
- **Full Level-5 black-box autonomy** ("humans unnecessary") — *anti-thesis*: contradicts the ND lens
  (the operator/partner IS the point) and the kernel-safety thesis. Argo is a **L4 collaborator + hard
  kernel** by design. Don't chase L5-as-blackbox.
- **Heavy spec ceremony** (Ouroboros 9 minds / Double Diamond / ontology-similarity ≥0.95) — built for
  greenfield; brownfield items ("fix this test") don't need it. Keep only the ambiguity gate.

### MISSING (Argo gaps the sources don't cover — self-supply; some in flight)
- **Self-modification safety** — none asks "what if the factory breaks the factory/kernel?" Argo's
  unique problem, addressed by O11 compartments + the `SR` propose→prove→swap design. Ahead; protect.
- **Two-layer trust** — they're one-layer (validation only). Argo = kernel + validation. Holdout is a
  *second* layer, not a kernel replacement. Lean into the two-layer story as the differentiator.
- **Intent-satisfaction + work-item-closure + cost-ledger** — the three concrete net-new gaps above.

### Our edge to protect (positioning)
Argo = dark factory **+ enforced kernel boundary + ND collaborator stance + self-repair architecture**.
The others are unmanned, one-layer, greenfield. That trio is the moat — don't trade it for black-box autonomy.

## Born-small codegen (the buildable near-term — `FAC-BORNSMALL`)

Make the factory GENERATE small, independently-repairable units by default (the broken-leg property
without later refactoring). The canonical template already exists: the **Tools registry**
(`argo-ts/src/tools/index.ts` `ALL_TOOLS` + `buildRegistry()`), mirrored by the REPL `HANDLERS` registry.

> A new unit of capability is a NEW FILE implementing a shared interface, registered by adding ONE
> entry to a flat list. Dispatch iterates the list; it is never edited to add a capability. One
> concern per file · file ≤300 lines · function ≤50 · co-located `*.test.ts`.

Three slices (all human-authored — `factory/*.ts` is kernel-protected skeleton):
1. **Verifier HARD GATE + `argo-ts/CONVENTIONS.md`** — pure `checkNewFilesUnderLineLimit` (NEW source
   files only — universally safe; scoping to all touched files would false-positive on bug fixes to
   pre-existing large files). Slot after the pure checks, before the git-stash block in `verify()`.
   Reject the "modified>new ratio" gate (false-positives). CONVENTIONS.md = the 3-tier taxonomy
   (HARD GATE / GUIDANCE / CONVENTION DOC) + registry template.
2. **Planner gene-transfusion guidance** — prepend a "PROVEN PATTERNS (spec wins on conflict)" block to
   `buildInstruction` for `roadmap`+`parked` (new-feature) categories only; one line for `quality`;
   leave `test-failure`/`type-error` untouched. Static gene v0; auto-extraction deferred.
3. **Executor per-dir CLAUDE.md wiring** — close the broken feedback loop: the factory requires agents
   to maintain per-dir CLAUDE.md but never reads them back. Inject `<dir>/CLAUDE.md` from
   `plan.touchedDirs` into the factory instruction (pure `buildFactoryInstruction(plan, budget, dirContexts)`).

## Verification
Per slice: `cd argo-ts && npx vitest run src/factory/<file>.test.ts` + `npx tsc --noEmit` + full suite
green. Slice-1 gate is a pure unit test (301-line new file → `ok:false`). End-to-end: `argo improve`
(L1 suggest, zero writes) on a roadmap/parked item → confirm the printed instruction carries the
born-small guidance + injected per-dir CLAUDE.md. Commit + push each slice.
