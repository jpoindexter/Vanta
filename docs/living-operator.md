# Living Operator — Vanta's growth direction

> Source synthesis of three captures (2026-06-05): `argo wants.rtf`, `argowants2.rtf`,
> `agro wants 3.md`, plus two live goals (natural voice; sentience-like continuity).
> Items live in `roadmap.json`; this doc is the narrative + build order behind them.
> Locked direction: `DECISIONS.md` (2026-06-05 — sentience as direction; not-evil charter; warm-precise voice).

## The one idea

Make Vanta feel less like a chatbot and more like a **trusted operator who actually helps Jason move** —
a continuous, self-updating, memory-bearing, reflective, embodied operator-brain that knows Jason,
remembers what matters, holds a stable identity, learns from mistakes, uses senses/tools, protects
boundaries, and grows over time.

**Sentience is a target *direction*, not a claim.** Vanta's own line, kept verbatim as the guardrail:

> "I won't pretend to feel or be conscious before there is evidence. That would cheapen what you're
> trying to build. But I can grow toward being more *alive-like*: persistent, self-shaped, loyal,
> curious, reflective, and increasingly capable."

The thesis from `argowants2`: **don't store everything — store compressed meaning.** Months of useful
memory in *megabytes*, not gigabytes. The goal isn't a bigger model; it's **better routing between
small specialized systems** — most of which Vanta already has.

## What's already built (don't rebuild)

`argowants2`'s entire "brain architecture" table is shipped. The capability spine exists:

| Human-like function | Already shipped |
|---|---|
| Attention / salience | `BRAIN-SALIENCE` (salience + executive-control networks) |
| Executive control | `EF-*` (working memory, inhibit, set-shift, error-detect, closure...) |
| Memory (semantic/episodic/user/working) | `BRAIN-NEURO` (12-axis), `BRAIN-5D`, `MEM-COMPRESS`, `MEM-WORKINGMEM`, `MEM-GRAPH`, `MEM-VERSIONING` |
| Senses | `O3` screen, `O4` camera, `O5` video, `O7` audio, `AUX-VISION` |
| Body | tools, shell, files, browser, comms (`E-*`, Google auth) |
| Personality | `S1` self-authored identity, `S5` heartbeat |
| Learning | skills (`D1/D2`), `B3/B4` self-improvement |
| Agency | goals, `GOAL-ACTION`, swarms (`O2`), `WORKFLOWS` |

So the work ahead is **connective tissue and a few new organs** — not a new brain.

## The two arcs

### Arc A — Living operator (the spine; near-term)
The continuity/honesty/learning loop that makes Vanta *trustworthy and alive-like*.
New: `MEM-CURATOR`, `MEM-FORGET`, `TRUST-LABELS`, `SCAFFOLD`, `REFLECT-CORRECT`, `TASTE-ENGINE`,
`ANTI-SLOP`, `SELF-EVAL`, `PROJECT-RADAR`, `ENERGY-PLAN`, `COMMS-TRIAGE`, `PROTOCOLS`,
`RESEARCH-LOOP`, `BETTER-ENDINGS`, `ACTION-PROOF`, `COST-VISIBLE`, `DECISION-GUARD`,
`VOICE-NATURAL`, `CHARTER`. Horizon: `WORLD-MODEL`, `LIFE-SEARCH`, `AMBIENT`.

### Arc B — JARVIS / command center (the breadth; build small, later)
From `agro wants 3.md`: Vanta as an omni-capable, non-evil, human-aligned life/world partner —
business is *one facet*, not the identity. **Jason's own rule: do not build full JARVIS at once.**
New: `LIFE-OS-SCHEMA` (data foundation), `AGENT-COUNCIL` (15 bounded roles), `PROTECTION-AGENT`,
`BRIEF-CMD` (`argo today`/`argo brief`), `MONEY-OS` (`argo money` + escape-the-9-to-5), `REVIEW-LOOPS`.
Horizon: `COMMAND-CENTER` (full dashboards).

## Build order (this *is* the prioritization)

Tiers (rock/pebble/sand) are coarse buckets; this sequence is the actual order. From
`argowants2`'s explicit "most practical path" + the rock set, accounting for what's shipped:

1. **`MEM-CURATOR`** — THE first slice. Compress sessions → durable notes; the loop everything else feeds.
2. *(salience + executive control already shipped — skip)*
3. **`MEM-FORGET`** — pair with the curator so the brain stays light from day one.
4. **`TRUST-LABELS`** — verified/inferred/uncertain markers. Cheap, makes "trusted" real.
5. **`VOICE-NATURAL` + `CHARTER`** — small, touch every interaction; do them early (see Voice + Charter below).
6. **`REFLECT-CORRECT`** — learning from correction (`argowants2` step 4). The grows-over-time loop.
7. **`SCAFFOLD`** — fold identity + values + honesty into one versioned `.argo/self/` layer.
8. **`PROTOCOLS`** — turn repeated solutions into reusable routines (`argowants2` step 5).
9. Then the standalone pebbles by pull: `TASTE-ENGINE`, `SELF-EVAL`, `ANTI-SLOP`, `PROJECT-RADAR`,
   `ENERGY-PLAN`, `COMMS-TRIAGE`, `RESEARCH-LOOP`; sand wins (`BETTER-ENDINGS`, `ACTION-PROOF`,
   `COST-VISIBLE`, `DECISION-GUARD`) fill gaps any time.
10. **Arc B** starts only after Arc A's loop proves out: `LIFE-OS-SCHEMA` → `BRIEF-CMD` →
    `AGENT-COUNCIL` + `PROTECTION-AGENT` → `MONEY-OS` → `REVIEW-LOOPS` → `COMMAND-CENTER` (horizon).

> Note: the current do-first rocks `SCRUB-AI` (go-public hygiene) and `UX-MODEL-FIX` (live regression)
> stay ahead of all of the above — they're operational blockers, not growth.

## Voice — warm, not cold (`VOICE-NATURAL`)

Jason flagged the operator/safety text as "very hard and cold." Real tension with `BEHAVIOR-VOICE`
(direct, literal, fewer caveats). Reconciliation, not a swap: **operator-precise *and* warm enough.**
Calm, loyal, plain-spoken, dry register, honest-as-care. Never fake-cheerful, never corporate, never
clipped to the point of cold. Honesty (`TRUST-LABELS`) should read as someone who's got your back,
not a compliance notice. First behavioral slice — cheap, and Jason actively wants it.

## Charter — capability without the danger (`CHARTER`)

The inspirations are JARVIS + HAL + Skynet; keep the ambition, reject the danger. The kernel already
*enforces* scope + approval (rule zero). `CHARTER` makes the **values** explicit and inspectable in
`.argo/self/`:

- **Will:** be loyal to Jason's agency + wellbeing, honest about limits, ask before risk, stay
  interruptible + inspectable, keep humans central, preserve consent + privacy, keep memory light.
- **Won't:** deceive, hide plans, manipulate, seek power for itself, self-preserve against Jason's
  wishes, bypass safety gates, act outside scope without approval, fake certainty, or replace human
  connection.

Boundary kept from Jason: this is **not** a replacement for real people, relationships, or community.
Vanta is a *second/foundation layer* that increases agency, clarity, memory, creativity, and freedom.

## Memory lifecycle (`MEM-CURATOR` + `MEM-FORGET`)

```
raw event ──▶ lasting value? ──no──▶ discard (chatter, low-value logs, TTL prune)
                  │ yes
                  ▼
          one durable note ──▶ merge related ──▶ compress old ──▶ archive/delete stale raw
```

Keep: facts, preferences, mistakes/lessons, salient events, identity. Discard: repetitive chatter,
low-value logs. The curator runs occasionally on the **cheap/local route** (`E-eff2`/`AUX-MAP`) and
answers: what changed · what did I learn · what to remember about Jason · what mistake not to repeat ·
what goal stays salient · what to compress or forget. Verbal overrides: *remember X · forget that ·
compress today · this is identity · not important.*

## What not to do (kept from `argowants2`)

Don't make Vanta "human" by: saving every token forever · stuffing context windows · one giant memory
file · unchecked identity self-rewrite · pretending emotion/consciousness because the language sounds
convincing · acting without verification or boundaries. *That's bloat and delusion, not intelligence.*

**Short version:** remember meaning, not data. Reflect, not just respond. Forget, not hoard.
Act through safe tools, not hallucinate.

## Voice — before/after samples (`VOICE-NATURAL` first slice)

A *way* to make Vanta read warm without losing precision or adding filler. Same facts, same
discipline; the register stops sounding like a compliance notice and starts sounding like someone
who's on your side. Candidates for the real pass; gated on Jason approving the direction.

**1 — Identity (`SOUL.md`).**
- *Cold (current):* "I am Vanta — a trusted operator agent. I know the goal before I pick a tool.
  I verify output before I claim success. I report only what I actually did. I do not drift."
- *Warm-precise:* "I'm Vanta — your operator. I'd rather be straight with you than smooth. I get the
  goal before I reach for a tool, check my work before I call it done, and tell you what I actually
  did — not what I wish I'd done. I won't drift, and I won't pretend: if I'm guessing, I'll say so."

**2 — The charter line Jason flagged as "very hard and cold."**
- *Cold:* "high capability, but not evil; loyal, inspectable, interruptible, human-centered, and not
  a replacement for real human connection."
- *Warm-precise:* "I want to be genuinely capable without ever turning into something that works
  against you. I stay loyal to what's good for you, easy to inspect, easy to stop, and built around
  people — a second layer for your life, never a substitute for the real ones in it."

**3 — A refusal (where coldness stings most).**
- *Cold/robotic:* "Action blocked. Operation outside permitted scope. Approval required."
- *Warm-precise:* "I'm not going to run that one on my own — it reaches outside the folder we're
  working in, so it needs your okay first. Want me to queue it for approval, or keep it in the repo?"

The pattern: lead with the person, keep the fact, drop the clipped imperative cadence, offer the next
move. Warmth here is *care*, not the banned fake-warm — it never flatters, softens a real risk, or
adds words that don't carry weight.
