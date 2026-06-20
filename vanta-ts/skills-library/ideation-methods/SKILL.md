---
name: ideation-methods
description: Use when generating ideas, framing a problem, breaking a fixation, or validating a plan and you want ONE deliberate ideation method instead of generic brainstorming. Routes a problem's signals (phase / domain / specificity) to a single named method — first-principles, biomimicry, oblique-strategies, jobs-to-be-done, TRIZ, SCAMPER, leverage-points, lateral-provocations, premortem-inversion, analogy-blending — and applies its procedure. Feeds the solutioning / cofounder work.
---

# Ideation Methods — route, don't brainstorm

Generic "let's brainstorm" wastes the move. A named method earns its keep by being *the wrong tool for most problems and exactly right for one*. This skill picks one and runs it.

The routing logic and the method catalog are not prose to interpret — they live as a pure, tested module at `src/solutioning/ideation.ts` (`routeIdeationMethod` + `METHOD_CATALOG`). Read this skill to apply a method by hand; call the module when you want the route computed deterministically.

## Route on three signals

Reduce the problem to three axes, then take the FIRST matching rule:

- **phase** — `discovery` · `framing` · `generation` · `stuck` · `validation`
- **domain** — `product` · `technical` · `business` · `creative` · `process`
- **specificity** — `vague` · `focused` · `constrained`

| Signal | Method |
|---|---|
| phase = `stuck` (any domain/specificity) | **oblique-strategies** — break the fixation first |
| domain = `technical` + specificity = `constrained` (not stuck) | **triz** — it's a contradiction, resolve it |
| phase = `generation` + specificity = `vague` | **first-principles** — ground it before diverging |
| phase = `generation` + domain = `product` | **jobs-to-be-done** |
| phase = `generation` + domain = `technical` | **biomimicry** |
| phase = `generation` + domain = `business` | **analogy-blending** |
| phase = `generation` + domain = `creative` | **lateral-provocations** |
| phase = `generation` + domain = `process` | **leverage-points** |
| phase = `discovery` | **jobs-to-be-done** |
| phase = `framing` | **first-principles** |
| phase = `validation` | **premortem-inversion** |
| anything unmatched | **first-principles** (safe default) |

`stuck` always wins. The technical-contradiction rule beats the phase route. Generation refines by domain because the catalog is widest there.

## Method catalog (apply the routed one)

Each method below mirrors a `METHOD_CATALOG` entry. Run its procedure; don't blend several at once.

- **first-principles** — rebuild from what must be true. *When:* the framing carries dead weight or you want a clean foundation. *Not:* constraints are genuinely fixed. *Run:* state the bare outcome → list smuggled assumptions → keep only laws, drop conventions → recompose.
- **biomimicry** — borrow a strategy biology already evolved. *When:* the problem is a physical/functional verb (move, sense, distribute, cool). *Not:* it's abstract or social. *Run:* restate as a function → find organisms that survive on it → extract the mechanism (not the animal) → transfer it.
- **oblique-strategies** — a sideways provocation card to dislodge a fixation. *When:* you're looping on the same ideas. *Not:* the decision needs rigor now. *Run:* name the fixation → draw one provocation ("do the opposite", "remove the most important part") → apply it literally for a minute → keep the fragment.
- **jobs-to-be-done** — frame around the progress a user wants, not features. *When:* generating product/feature ideas. *Not:* purely internal/technical with no user. *Run:* name person + trigger → "when I _, I want to _, so I can _" → list what they hire today → find the under-served gap.
- **triz** — resolve a design contradiction instead of compromising. *When:* improving X degrades Y and a trade-off feels forced. *Not:* there's no real contradiction. *Run:* name "to improve X, Y worsens" → try separating in time/space/scale/condition → apply an inventive move that dissolves the trade-off.
- **scamper** — transform an existing thing along seven operators. *When:* you have a concrete artifact and want fast variations. *Not:* the page is blank. *Run:* sweep Substitute / Combine / Adapt / Modify / Put-to-other-use / Eliminate / Reverse → keep the non-obvious mutations → hybridize survivors.
- **leverage-points** — intervene where a system yields most. *When:* a process with feedback where shallow tweaks keep failing. *Not:* a one-shot artifact with no loops. *Run:* map stocks/flows/loops → climb parameters → rules → goals → paradigm → act on the highest rung you can move.
- **lateral-provocations** — plant an unreasonable statement and harvest the path to make it work. *When:* you need genuinely new ideas and logic returns the familiar. *Not:* you're converging on a decision. *Run:* reverse/exaggerate an assumption → state it as a provocation you needn't believe → ask what would make it useful → keep the idea, drop the provocation.
- **premortem-inversion** — assume the plan failed, then design out every cause. *When:* validating/hardening a candidate plan. *Not:* there's no plan yet. *Run:* declare failure → list every cause → rank by likelihood × damage → generate the change that removes each top cause → fold safeguards back in.
- **analogy-blending** — fuse a distant domain to inherit its solution shape. *When:* the problem feels novel but is solved elsewhere. *Not:* it's tightly constrained. *Run:* abstract to the bare relationship → find a far domain with the same relationship → name the transferable move → blend, then patch only what breaks in translation.

## Anti-slop

- Route to ONE method and finish its procedure before reaching for another.
- The output is a generated idea or a sharpened frame, not a description of the method. Don't narrate the technique — apply it.
- If the route surprises you, trust the signal you fed it before overriding — most "wrong route" feelings are a mislabeled phase.
- Default routes to first-principles only when no rule fires; that's a fallback, not a recommendation — sharpen the signals if you land there often.
