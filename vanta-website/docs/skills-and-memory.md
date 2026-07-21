---
id: skills-and-memory
title: Skills & memory
sidebar_position: 3
---

# Skills & memory

Vanta persists what it learns to the global store at `~/.vanta` (override with `VANTA_HOME`). The store is git-initialized, so every write is versioned for free.

## The brain

The brain is one cohesive unit — everything outside `brain/` imports from a single facade. It composes two layers:

- **Markdown regions** — nine seeded regions (`identity`, `semantic`, `episodic`, `user_model`, `drives`, `reflections`, `mood`, …) at `~/.vanta/brain/<region>.md`, archived + git-versioned.
- **Structured entries** — typed memories with strength × recency × contradiction-penalized confidence, salience/retrieval bonuses, and crystallization (raw → compressed → crystallized after repeated retrievals), with decay.

Surface: `remember` / `recall` (recall reinforces) / `brainDigest` (one composed prompt digest) / `sweep` / `brainHealth`. Each layer is best-effort — a broken layer degrades, never breaks the agent.

**Guardrails:** recalled entries are labeled usable only when fresh, non-conflicting, and provenanced. Stale / conflicting / weak-provenance entries surface as "not used" hypotheses, and the prompt requires verifying current state before acting on them.

## Memory

Per-goal summaries live at `~/.vanta/memories/<goalId>.md`, capped per goal (older blocks stay in git history). A forked distiller maintains a session-memory file during long sessions and re-injects it on compaction or resume.

## Skills

Learned and bundled skills live at `~/.vanta/skills/<slug>/SKILL.md`. The skill **index** is injected into the prompt; `recall` loads a full skill body on demand. A curator archives stale learned skills non-destructively (reversible, never deletes hand-authored skills).

A bundled library auto-installs each session, including `nd-*` gate skills, seven diagnosis-free skills from `executive-function-skills/`, build-discipline skills, and design skills. The new pack covers functional minimums, task decomposition, working-memory externalization, interest-based initiation, predictable communication, and time/transition support.

## Continuity across sessions

- **Resume** is age-gated — a prior thread is only carried into a restart if recent (`VANTA_RESUME_MAX_AGE_MIN`, default 120; `0` = always clean).
- **Carried goals** launch paused until `/goal resume`.
- **Auto-handoff** writes `.vanta/handoff.md` when context fills past a threshold and reloads it on the next interactive launch.
