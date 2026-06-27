---
id: roadmap
title: Roadmap
sidebar_position: 1
---

# Roadmap

Where Vanta is headed and what just shipped — generated straight from the project board, so it never goes stale.

_930 capabilities shipped · 3 in flight · 149 on the horizon. Updated 2026-06-27._

## In flight

What we are actively building next.

### Auto-fire ideation routing across Vanta / Claude /

**Cofounder engine** · S-size

Make the 22-method ideation routing fire automatically when an ideation-intent prompt arrives, in every agent the operator uses. Vanta side is done (UserPromptSubmit trigger in the skill frontmatter, auto-synced to ~/.vanta/hooks.json each session). The cross-agent half writes global agent config, so it stays confirm-gated

### Autonomous (bash) builds in a Docker container — the containment that works

**Harness** · L-size

Replaces the parked sandbox-exec approach (VANTA-A2A-AUTONOMOUS-SANDBOX), where claude couldn't even RUN inside macOS seatbelt. A Docker container gives claude a FULL machine where it runs normally, boxed to exactly the folders Vanta mounts (the mount-set IS the boundary). Daytona was the obvious purpose-built fit but went open→CLOSED source — don't build Vanta's autonomy on a ruggable platform; use the open Docker primitive Vanta ALREADY ships (exec/backend.ts buildDockerArgs / the BACKEND-DOCKER card). Plumbing left: a small claude-image + per-run OAuth-token injection, --network on for npm, project bind-mounted. CONTAINMENT PROVEN LIVE 2026-06-26: a real OrbStack/Docker container cleaned a mounted /tmp folder (organized by type) and provably could NOT read an un-mounted folder or ~/.ssh; work persisted on disk after --rm. Can't live-verify the claude bypass from other agents's own harness (it blocks the flag) → build the image + adapter here, operator verifies the first real run. Apple's open `container` runtime is a macOS-native lighter alternative to evaluate

### Mount-set = scope: Vanta picks + approves the agent's blast radius per task

**Harness** · M-size

The policy layer over VANTA-A2A-DOCKER-AUTONOMOUS. The container turns Vanta's existing 'scope' concept into a HARD, OS-enforced boundary — a mount can't be talked-past the way a keyword denylist can. Vanta infers the mount-set from the task (build → a fresh output dir; clean Downloads → ~/Downloads rw; fix repo X → that repo; analyze photos → ~/Pictures ro), SURFACES it for human approval (the blast radius) before spinning up, then runs the agent boxed to it. Whole-system tasks ('find big files across my disk') don't fit a box (mounting / = no containment) → fall back to host + approval-gating, or ask. Caveat to design for: the box scopes WHERE, not WHETHER-reversible — 'clean up' inside the mount still means real deletes, so destructive-within-scope wants a dry-run/confirm or a pre-snapshot of the dir

## Recently shipped

The latest of 930+ capabilities. See the [changelog](./changelog) for curated milestones.

- **Reliability stress harness — scored, repeated, concurrency + long-horizon batteries** — Harness · 2026-06-27
- **Prove a long autonomous run finishes unattended (Pillar 1 win condition)** — Harness · 2026-06-27
- **Headless multi-turn: fix the input mechanism or declare run the only path** — Harness · 2026-06-27
- **Wire the reliability harnesses into a tracked scored eval** — Harness · 2026-06-27
- **Reliability across providers (cold-start / timeout / tool-parse variance)** — Harness · 2026-06-27
- **Higher-concurrency kernel soak (&gt;16 parallel) to find the contention ceiling** — Harness · 2026-06-27
- **Provider hardening for long unattended runs — request/idle timeout + transient retry** — Harness · 2026-06-27
- **Width-responsive TUI menus — kill fixed truncation across every palette/list** — Operator · 2026-06-25
- **Gate UserPromptSubmit skill triggers on the prompt regex for other agents** — Harness · 2026-06-25
- **Route 'talk to / start other agents' to the existing call_agent tool** — Harness · 2026-06-25
- **Persistent interactive external-agent session — drive other agents turn-by-turn** — Harness · 2026-06-25
- **ACP client — drive another ACP agent over the protocol, not the terminal** — Extensibility · 2026-06-25
- **Sandbox dead-end -&gt; redirect a refused agent launch to the supported path** — Harness · 2026-06-25
- **Stream a called agent's output live instead of a silent wait-then-dump** — Harness · 2026-06-25
- **Routed creative-ideation method catalog** — Cofounder engine · 2026-06-24
- **User-extensible provider registry (~/.vanta/providers.json)** — Extensibility · 2026-06-24
- **Router providers free-type any model in the setup wizard** — Operator · 2026-06-24
- **Internal sandbox blocks tsx when Vanta shells out to its own CLI (EPERM on IPC pipe)** — Harness · 2026-06-24
- **Dead-simple setup — first install works for a non-CS user (no toolchain)** — Operator · 2026-06-22
- **Prebuilt vanta-kernel binaries via GitHub Releases (no Rust to install)** — Operator · 2026-06-22

## On the horizon

Directional, not committed — grouped by area, newest thinking first.

### Cofounder engine — 11 planned

- Self-evolve metrics — lift-per-iteration + human-in-loop ratio + spend
- Regression foresight — predict what an evolve edit will BREAK, not just fix
- Interaction-aware evolution — account for non-additive component effects
- Delegation up/down the org chart
- Leadership chat that resolves to real work objects
- Self-organization — agents propose org changes within governance
- _…and 5 more_

### Extensibility — 17 planned

- Bundles (skill aliases)
- 169 bundled skills (74 + 95 optional)
- Blueprints — reusable project/agent scaffolds you instantiate
- Skills hub — discover/share skills + agentskills.io standard compat
- A2A networked transport behind a Transport interface
- Out-of-process plugin workers + capability-gated host services
- _…and 11 more_

### Harness — 35 planned

- TUI delight / personality pass (not a soulless CLI)
- Commit attribution — track another agent-modified files for git co-authorship
- `/bg` while responding — active response continues in background, not dropped
- Tree-sitter bash parser — AST-accurate security validation for bash commands
- Self-hosted runner — dedicated entrypoint for running another agent as a CI/CD runner
- Secrets (Bitwarden Secrets Manager)
- _…and 29 more_

### Operator — 82 planned

- Gateway channel self-heal — auto-reconnect + health recovery
- Marketing/analytics connectors (amplitude, customer.io, ads)
- Unified cross-agent memory — ingest from/other agents/other agents
- Continuous live screen + app-context feed (approved local actions)
- TUI v2 — state / safety / working-memory / telemetry rails
- Hooks configuration menu — event/hook/matcher mode selectors
- _…and 76 more_

### Solutioning — 4 planned

- Intent/spec recovery from code + intent-drift detection
- Change-watchers for repos/issues/email/calendar
- Mine Goose/Reference for stealable patterns
- Calibrated solutioning — ranged/ensembled recommendations + revisit triggers
