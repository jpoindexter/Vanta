---
name: ideation-methods
description: Use when generating ideas, framing a problem, breaking a fixation, or validating a plan and you want ONE deliberate creative method instead of generic brainstorming. Routes a problem's signals (phase / domain / specificity / feasibility↔creativity balance) to ONE of 22 named methods from artists, scientists, and designers — Eno, Dalí-adjacent Jarry, Cage, de Bono, Pólya, Alexander, Meadows, Vonnegut, Tharp and more — and runs its procedure. Backed by a deterministic, tested router (src/solutioning/ideation.ts), so the choice is reproducible, not vibes. Feeds the solutioning / cofounder pillar.
tags: [creativity, ideation, solutioning, cofounder]
triggers: [{"event":"UserPromptSubmit","match":"(?i)\\b(ideate|brainstorm|fresh (ideas?|inspiration|angle)|new angle|come up with (ideas?|something)|i'?m stuck|out of ideas|creative ideas?|need inspiration)\\b"}]
---

# Ideation Methods — route, don't brainstorm

Generic "let's brainstorm" wastes the move. A named method earns its keep by being *the wrong tool for most problems and exactly right for one*. This skill picks one and runs it — and unlike a prose library, the choice is computed by a **deterministic, tested router**, so the same problem routes the same way every time.

The router and the 22-method catalog live as a pure, tested module at `src/solutioning/ideation.ts` (`routeIdeationMethod` + `METHOD_CATALOG`). Read this skill to apply a method by hand; call the module when you want the route computed.

## Route on four signals

Reduce the problem to four axes; the first three pick the method, the fourth tunes how wild it gets:

- **phase** — `discovery` · `framing` · `generation` · `stuck` · `validation`
- **domain** — `product` · `technical` · `business` · `creative` · `process` · `writing`
- **specificity** — `vague` · `focused` · `constrained`
- **balance** — `feasible` ↔ `balanced` ↔ `novel` — the feasibility/creativity lever

Base rules (first match wins): `stuck` → a fixation-breaker, always. `technical` + `constrained` → **TRIZ** (it's a contradiction). `generation` refines by domain (widest catalog); a still-`vague` generation grounds in first-principles first. `framing` + `writing` → **Oulipo**. Else the phase route. **Then balance overrides:** `novel` escalates to the phase's divergent method, `feasible` grounds to its buildable one, `balanced`/unset keeps the base route. *That balance axis is what a phase/domain-only router can't do — it's how you hit the "perfect balance of feasibility and creativity."*

## The 22 methods — grouped on the feasibility↔creativity axis

Run the routed method's procedure (in the module); don't blend several at once. Origin is attribution, not decoration — a method carries the judgment of whoever forged it.

**Grounding (buildable — pick when `balance: feasible`)**
- **Pólya** (Pólya) — work a well-posed problem with understand → plan → execute → look-back.
- **Premortem Inversion** (Klein) — assume the plan failed; design out every cause.
- **Affinity Diagrams** (Kawakita / KJ) — cluster scattered notes in silence until structure emerges.
- **First-Principles** — rebuild from what must be true, not how it's done.
- **Jobs-To-Be-Done** (Christensen / Ulwick) — frame around the progress a user wants.
- **Creative Discipline** (Tharp) — feed the spine to carry a long work past the novelty high.
- **Pattern Languages** (Alexander) — capture a recurring solution as context → forces → resolution.
- **TRIZ** (Altshuller) — resolve the design contradiction instead of trading X for Y.
- **Leverage Points** (Meadows) — intervene at rules/goals, not surface parameters.

**Balanced**
- **Compression-Progress** (Schmidhuber) — keep the idea whose insight compresses the most.
- **Biomimicry** (Benyus) — borrow a strategy biology already evolved.
- **SCAMPER** (Osborn / Eberle) — transform an artifact along seven operators.
- **Volume Generation** (Glass) — generate many with judgment off, then cut hard.
- **Story Skeletons** (Vonnegut) — borrow a narrative arc to shape a sequence.
- **Analogy & Blending** (Fauconnier & Turner) — fuse a distant domain's solution shape.

**Divergent (wild — pick when `balance: novel`)**
- **Oulipo Constraints** (Queneau & Perec) — let an arbitrary hard constraint do the inventing.
- **Defamiliarization** (Shklovsky) — strip the names off a familiar thing to see it again.
- **Oblique Strategies** (Eno & Schmidt) — a sideways provocation card to break a fixation.
- **Dérive & Mapping** (Debord) — drift the space with no goal, then map the adjacency.
- **Lateral Provocation / PO** (de Bono) — plant an unreasonable statement, harvest the path.
- **Chance & Remix** (Cage · Eno · Ferguson) — let a real random input pick what taste won't.
- **Pataphysics** (Jarry) — engineer an imaginary solution rigorously, port back what survives.

## Operating principles

- **Constraint + direction makes the spark** — a method without a target produces slop; a target without a method produces the obvious.
- **Reject the first idea as the default** — the un-routed LLM answer is exactly what this skill exists to displace. If you generate without routing, you've defeated it.
- **One method per response** — finish its procedure before reaching for another.
- **Mechanisms over abstractions** — the output is a concrete idea or a sharpened frame, not a description of the technique. Apply it; don't narrate it.
- **Keep the weird buildable** — `novel` is for breaking orbit, but land it back on something that ships. That's the balance lever's whole job.
- **Attribute the method** — name the originator; it signals which judgment you're borrowing.
- **Commit to the user's pick** — if they name a method, run it; don't regenerate endlessly.

## Anti-slop

- If the route surprises you, trust the signals you fed it before overriding — most "wrong route" feelings are a mislabeled phase.
- The default lands on first-principles only when no rule fires; that's a fallback, not a recommendation — sharpen the signals if you land there often.
- Don't reach for `novel` to look clever or `feasible` to play safe — pick the balance the *problem* needs.
