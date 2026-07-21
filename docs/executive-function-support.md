# Capacity-aware executive-function support

Vanta is neurodivergent-first without being diagnosis-gated or person-specific. The operating contract is built directly into Vanta's core system prompt and applies in every normal session. It does not depend on skill discovery or a slash command.

With every current-state field on `auto`, Vanta adapts only to explicit situational language and observable task friction. A deterministic pre-turn router recognizes activation friction, low bandwidth, reorientation requests, corrections, and broad multi-step tasks. It injects a private turn directive without modifying the saved transcript. If the operator says they are stuck, overwhelmed, low on energy, cannot start, or asks what comes next, Vanta reduces choices, externalizes the current state, and starts or identifies one safe reversible action.

The harness also monitors Vanta's own tool loop. An action task that accumulates six read-only calls receives one bounded self-redirect toward execution; repeated or failing calls receive a different-approach directive before the existing hard stop. These checks do not infer autism, ADHD, burnout, personality, or durable capacity from writing style, and automatic adaptations are not saved as profile facts.

## Runtime flow

```mermaid
flowchart TD
  A[Incoming task] --> R{Observable interaction and task signals}
  R -->|Friction detected| S[Inject private turn-local support]
  R -->|No signal| B
  S --> B{Explicit current capacity override}
  B -->|Low| C[Preserve a safe functional minimum]
  B -->|Auto, steady, or high| D{Working-memory load}
  D -->|High| E[Externalize outcome, state, blockers, next, and done]
  D -->|Auto or low| F{Activation or motivation barrier}
  E --> F
  F -->|Stuck or low| G[Start one reversible action plus one truthful activation bridge]
  F -->|Ready or auto| H[Normal task execution]
  C --> I[Checkpoint and leave a re-entry point]
  G --> I
  H --> I
  I --> L{Tool loop drifting?}
  L -->|Research-only or repeating| X[Inject one private self-redirect]
  L -->|No| J[Continue or finish]
  X --> J
```

`auto` means no durable claim. The universal operating contract remains active, while situational adaptations are turn-local. Explicit `/support` values override Auto when the operator wants deterministic behavior. Supports modify the task or environment before demanding more effort from the operator.

## Commands

The diagnosis-free entry point is `/support`; `/nd` remains a compatible alias for the full gate profile.

```text
/support
/support capacity low|steady|high|auto
/support load low|high|auto
/support activation ready|stuck|auto
/support motivation engaged|low|auto
/support reset
```

Communication preferences remain available through either command:

```text
/support density minimal|balanced|rich
/support sensory low|medium|high
/support time ranges|points|off
```

The profile persists in `~/.vanta/nd-profile.json`. Older profiles load with all new current-state fields set to `auto`.

## Reusable skill pack

The skill pack is an export surface for other compatible agents. Vanta's core behavior does not require these skills to be installed, selected, recalled, or invoked.

[`executive-function-skills/`](../executive-function-skills/) contains seven independently installable skills:

1. `executive-function-router`
2. `functional-minimums`
3. `task-decomposition`
4. `working-memory-externalizer`
5. `interest-based-initiation`
6. `predictable-low-load-communication`
7. `time-and-transition-support`

Vanta deliberately does not self-install this pack through `vanta skills install`; doing so would duplicate its core prompt contract. The folder remains a distributable source for other compatible agents.

## Source synthesis

The implementation paraphrases task-support concepts from:

- Peg Dawson and Richard Guare's executive-skills taxonomy and environment-first interventions
- Judith Kolberg and Kathleen Nadeau's structure, support, strategy, and externalizing systems
- KC Davis's function-first, morally neutral minimums
- Tamara Rosier's energy, activation, and short-experiment framing
- Megan Anna Neff's sensory, interoceptive, burnout, and transition support
- Devon Price's self-trust, masking awareness, and user-defined accommodation
- Oxford's NESTL toolkit for proactive inclusive design and flexible participation

| Source | Extracted product pattern | Encoded in |
| --- | --- | --- |
| *Smart but Scattered* series | Executive-skill taxonomy; change the environment or task; observable goals; review and fade scaffolding | router, decomposition, time/transition |
| *ADD-Friendly Ways to Organize Your Life* | Structure + support + strategy; visible launch points; externalize time and state; match support level to challenge | externalizer, decomposition, router |
| *How to Keep House While Drowning* | Tasks are morally neutral; the user defines function; safety and usefulness precede convention and polish | functional minimums |
| *Your Brain's Not Broken Workbook* | Separate emotional, cognitive, technical, and environmental blockers; compare expected with observed effort; use short experiments | interest-based initiation |
| *Self-Care for Autistic People* | Sensory and interoceptive load; predictable transitions; direct communication; burnout-aware pacing; examples and templates | low-load communication, time/transition, router |
| *Unmasking Autism* | Self-trust, consensual accommodation, no required disclosure, no masking as a success metric | privacy and anti-overreach contract |
| NESTL toolkit | Proactive support without diagnosis; clear expectations; multiple participation modes; advance context; sensory control | low-load communication and universal defaults |

Household-specific routines, child/parent behavior programs, diagnostic scoring, and medical claims were not copied into the runtime. Useful mechanics were generalized only when they preserved operator autonomy and fit Vanta's task domain.

The source books are not redistributed. The supplied `about-me.md` informed universal requirements such as direct language, pattern-first explanation, low-density structure, and current-instruction precedence; none of its personal facts are copied into product seeds, skills, or documentation.

## Privacy and safety contract

- Never infer or store a diagnosis.
- Treat capacity, load, activation, and motivation as current and overridable.
- Do not manufacture urgency, shame, or emotional pressure.
- Preserve consent, verification, data integrity, and irreversible-step checks at every capacity.
- Do not turn a simple request into an intake or coaching ritual.
- Keep personal preferences evidence-based, correctable, and separate from Vanta's public defaults.

## Verification boundary

The TypeScript runtime currently persists and renders the support state through `/support` and the system prompt. Desktop controls and automatic session expiry are separate roadmap work; this document does not claim they already ship.
