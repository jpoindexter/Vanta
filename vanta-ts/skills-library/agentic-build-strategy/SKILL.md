---
name: agentic-build-strategy
description: "The judgment layer for building in the agentic era (Boris Cherny): what to point the machinery at - coding-is-solved, product overhang, build-for-the-next-model, domain > coding, one-week planning, generalist + route-to-specialists, and which moats AI shifts."
created: 2026-06-07
updated: 2026-06-07
tags: [strategy, principles, product, moats, planning, judgment, agentic]
---

# Agentic Build Strategy

Not a procedure — the **judgment layer** that decides *what* to point loops, agents, and workflows at. Recall when planning what to build, prioritizing, or making a product/strategy call. From Boris Cherny's talk; these are frames, not laws.

## Principles

- **Coding is "solved" (for him, since late 2025).** Stop hand-writing; measure **shipped + verified**, not keystrokes. Not yet true for big/complex codebases or weird languages — "wait for the next model".
- **Product overhang.** "The model can do all the stuff no product has captured yet." Find a capability that's *barely* possible today and build the harness for it.
- **Build for the next model.** another agent "didn't work for the first 6 months" — built pre-PMF on purpose; inflected as models improved. Pick a bet that's ugly now; dogfood until the model catches up.
- **Build something people love.** Model vs product is roughly 50/50; "the little details" for all-day use decide love. Obsess one flow's details before adding the second feature.
- **Domain > coding.** "The best person to write accounting software is a great accountant. Coding is the easy part." Build where you hold domain depth; let agents handle the code.
- **Everyone's a generalist.** Solo = be the generalist; route depth to specialist agents (see `agent-fanout`).
- **Plan one week out.** Each release resets what's possible — short slices, don't architect for a model that doesn't exist yet. (Matches Vanta's anti-drift: ship the slice.)
- **On-distribution stack.** Default to boring/common stacks (TS + React) unless you have a reason not to — still a lever on hard tasks.

## Which moats AI shifts (Seven Powers)

| Power | AI's effect | Your move |
|-------|-------------|-----------|
| Switching costs | **Weaker** — the model ports users/data between tools | Don't rely on lock-in; make staying obviously better |
| Process power | **Weaker** — models hill-climb a process "till it's done" | Expose workflows to agents; keep improving them |
| Network effects | **Holds** | Collaboration, marketplaces, shared data, distribution loops |
| Scale economies | **Holds** | Use scale for cost, reliability, trust, speed |
| Cornered resources | **Holds** | Exclusive data, talent, partnerships, brand, trust |

## The arc

Software is on the printing-press curve — soon a general literacy, not an engineering specialty, "much faster than 50 years". Startups disrupt 10x more: they build AI-native from zero while incumbents retrain and fight resistance. "Best time to build."

## Attribution

Extracted from Boris Cherny, *Why Coding Is Solved* (Anthropic, 03:15-17:23), §7 "Strategic frames" + Seven Powers, via the build-catalog extraction. Frames lightly de-disfluencied; not independently fact-checked.
