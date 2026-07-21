---
id: executive-function
title: Executive-function support
sidebar_position: 7
---

# Executive-function support

Vanta is neurodivergent-first without requiring a diagnosis or a personal biography. Executive-function support is part of the core system prompt and works automatically in every normal session; it is not something you must install or invoke.

In Auto mode, a deterministic per-turn router responds to explicit situational language and observable task friction. Saying “I'm stuck,” “this is too much,” “what's next,” “I can't start,” or correcting a missed instruction makes Vanta reduce choices, externalize the current state, and begin or identify one safe reversible action. Broad multi-step tasks automatically receive one active step instead of an expanding plan.

Vanta also monitors its own tool loop. If an action request produces six research-only calls, or a tool approach starts repeating or failing, the harness privately redirects the model toward a materially different executable step. The directive is bounded to one redirect and is not added to the visible or saved conversation. These adaptations are turn-local: Vanta does not infer or store a diagnosis, personality, or durable capacity from how you write.

## Set current support

Use `/support` in the terminal or TUI:

```text
/support capacity low|steady|high|auto
/support load low|high|auto
/support activation ready|stuck|auto
/support motivation engaged|low|auto
/support reset
```

`auto` makes no durable claim and keeps the built-in adaptive task flow. `/support` is an optional override when you want deterministic behavior. `/nd` remains an alias for the complete gate and preference surface.

When capacity is low, Vanta keeps safety and the requested function, defers optional polish, and leaves a re-entry point. High memory load makes it externalize the outcome, current step, evidence, blockers, next step, and definition of done. A stuck or low-motivation state starts one reversible action and adds at most one truthful interest, novelty, challenge, or feedback bridge. It never invents urgency.

## Communication controls

```text
/support density minimal|balanced|rich
/support sensory low|medium|high
/support time ranges|points|off
```

Profiles persist at `~/.vanta/nd-profile.json`. Existing profiles gain the current-state fields as `auto`, preserving previous behavior.

## Long-session gates

| Gate | When it fires |
|------|---------------|
| **Research** | Too many read/analyze turns without concrete output |
| **Complexity** | A multi-file, schema, or ambiguous request needs explicit sequencing |
| **Inhibit** | Consecutive off-goal turns indicate drift |
| **Set-shift** | The same approach fails repeatedly |
| **Closure** | A topic shift risks abandoning in-progress work |
| **Task initiation** | An active outcome has no executable first action |
| **Hyperfocus** | A long single-area run needs a checkpoint or exit |
| **Time blindness** | An enabled elapsed-time checkpoint becomes due |
| **Velocity** | Capturing work is outpacing shipping it |

Each gate is best-effort and isolated so a support failure never breaks the task loop.

## Reusable skills

Vanta also exports seven diagnosis-free skills covering support routing, functional minimums, task decomposition, working-memory externalization, interest-based initiation, predictable communication, and time/transition support. They can be installed independently in other compatible agents; Vanta's own automatic behavior does not depend on the skill pack.

The methods synthesize work by Dawson and Guare, Kolberg and Nadeau, KC Davis, Tamara Rosier, Megan Anna Neff, Devon Price, and Oxford's NESTL toolkit. The source books and personal profile used during product research are not bundled.

## Boundaries

- No diagnosis inference or diagnostic testing
- No shame, fabricated deadlines, or manipulative urgency
- No reduction of safety, consent, or verification
- Current state is explicit, temporary in meaning, and always overridable
- Simple requests remain simple; support must not become another maintenance burden

Desktop support controls and automatic session expiry are tracked separately on the roadmap.
