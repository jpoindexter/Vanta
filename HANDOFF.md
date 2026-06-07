# Vanta — Session Handoff (2026-06-07)

Cold-start context for the next thread. Read this + `CLAUDE.md` + `ROADMAP.md` first.

---

## ⚑ DO THIS FIRST (offline — no Vanta session running)

You chose to rename the on-disk repo folder `Argo/ → Vanta/`. It's cosmetic (the
code finds its root via `Cargo.toml`), but both global launchers hardcode the old
path, so the folder mv + launcher fix must happen together, with nothing running.

```sh
# 1. Quit any Vanta session. Free port 7788 if a stale kernel holds it:
lsof -nP -iTCP:7788 -sTCP:LISTEN        # note the PID, then: kill <PID>

# 2. Rename the folder:
mv ~/Documents/GitHub/Argo ~/Documents/GitHub/Vanta

# 3. Re-register the launcher from the NEW location (regenerates ~/.local/bin/vanta
#    with the correct path + symlinks the gitleaks/size pre-commit hook):
cd ~/Documents/GitHub/Vanta && ./install.sh

# 4. Drop the stale old launcher (vanta replaces it):
rm -f ~/.local/bin/argo

# 5. Verify:
which vanta && vanta doctor
```

**Optional (carries this session's auto-memory to the new path):** Claude Code keys
project memory by folder path, so a session in `Vanta/` starts a fresh memory dir.
To keep the index:
`mv ~/.claude/projects/-Users-jasonpoindexter-Documents-GitHub-Argo ~/.claude/projects/-Users-jasonpoindexter-Documents-GitHub-Vanta`

**Note:** CodeGraph (`.codegraph/`) moves with the folder; if queries look stale after
the mv, run `codegraph index` once from `~/Documents/GitHub/Vanta`.

---

## Where things are (2026-06-07)

- **Repo:** currently `~/Documents/GitHub/Argo` (→ `Vanta/` after the mv above). Rust kernel `src/*.rs`; TS agent `vanta-ts/`.
- **Branch:** `feat/v1-hermes-parity` — **all work pushed, clean tree.** Remote: `github.com/jpoindexter/Vanta`.
- **Tests:** **1227 TS (vitest) + 27 Rust = 1254 green**; `tsc --noEmit` clean. 46 tools.
  - Run: `cd vanta-ts && npx vitest run && npx tsc --noEmit` · `cd .. && cargo test`
  - **Always run `git` from the repo root** (tsx/test commands cd into `vanta-ts/` and the shell cwd persists).
- **`vanta` command:** now works (`~/.local/bin/vanta` created this session; `argo` still works as a back-compat alias until step 4 above).

## What shipped this session (20 roadmap cards — all in `roadmap.json`, status `shipped`)

UX-MODEL-FIX · RESTART · TOOL-RETRY · BEHAVIOR-VOICE · GOAL-ACTION · STALL-UNBLOCK ·
ROADMAP-ADD · BUG-CAPTURE · HANDOFF-PACKET · COST-VISIBLE · MODE-DETECT · AUTO-HANDOFF ·
ACTION-PROOF · CODE-SIZE-GATE (+ wired into `write_file`) · CC-EDITOR · CLI-DX-PACK ·
and VERIFY-RIGHT/TRUST-LABELS/REF-FIDELITY/BETTER-ENDINGS folded into prompt rules 1/4/7.
Per-card notes live in each card's `summary` in `roadmap.json`. Module detail:
`vanta-ts/CLAUDE.md` §"Session additions (2026-06-07)".

## SIZE-PAYDOWN — cli.ts DONE; 78 violations remain (next-session)

`vanta lint` surfaced ~85 violations. **DONE 2026-06-07: cli.ts** (the worst — 428L,
`main` cx-42, grew per command): `main`'s if-chain → a `COMMANDS` lookup table; handlers
extracted to `cli/commands.ts`. cli.ts 428→175L, both gate-clean, routing live-verified.
Violations 85→78.

**Remaining (78), tackle incrementally — full suite + live smoke per file:**
- **Limbs (lower risk, do first):** `interactive.ts` (335L; `runChat` 240L + nested
  `runUserTurn` 107L — extract the post-turn-gate pipeline + the slash-dispatch block),
  `desktop/server.ts`, `memory/compress.ts`.
- **Brainstem (higher blast radius per the factory compartment map — do carefully,
  not rushed):** `providers/index.ts` (`resolveProvider` cx-24 — a provider table like
  cli's), `agent.ts` (`runTurn` 129L/cx-23), `factory/run.ts` (`runCycle` 134L).
- Goal: `vanta lint` 0 on `src/`, then set `VANTA_LINT_BLOCK=1` so the gate stays green.
Pattern proven on cli.ts: lookup-table for dispatchers, extract helpers for long fns,
verify each file with the full suite. Tracked as the `SIZE-PAYDOWN` card.

## Backlog shape (`roadmap.json` — 270 cards: 158 shipped · 86 next · 26 horizon)

- **Gated on you:** SCRUB-AI (force-push history rewrite) · VOICE-NATURAL (3-sample approval).
- **External setup:** COMMS-TRIAGE (OAuth) · AUTH-BROWSER (Playwright login) · MSG-* (daemons/perms).
- **Big-design Rocks (brainstorm first):** EF-TASKSTACK · MEM-RELEVANCE · OPERATOR-DASHBOARD (L) · AGENT-COUNCIL (L) · AUTO-ROUTER · PROJECT-RADAR · the MEM-* / TASTE arc.
- **Model-in-loop S cards:** SELF-EVAL · ANTI-SLOP · ENERGY-PLAN · DECISION-GUARD · CC-LINKS.
- **Platform:** DESKTOP-P0…P11, TUI-V2* (12 cards).

## Discipline that worked (keep it)

- One card = real code + co-located test + `tsc` clean + full `vitest` run + `roadmap.json` marked + commit + push.
- Fold related prompt cards into existing rules — don't append rules 11+ (prompt is per-turn).
- Run the **full** suite on any host/shared-file change (pure-unit + tsc aren't enough for two-host wiring).
- Honest bar: code-only/prompt-only cards are "wired + unit-tested, live-verify pending" — not "proven."
- `roadmap.html` is gitignored — regenerate via `roadmap/build.ts buildRoadmap`, never `git add` it.
