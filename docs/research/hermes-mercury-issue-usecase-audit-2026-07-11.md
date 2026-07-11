# Hermes issues, Mercury, user stories, and public-site audit

Date: 2026-07-11

## Evidence boundary

- Hermes source snapshot: `reference/hermes-agent` at `3b2ef789d` (current `origin/main` when checked).
- Mercury source snapshot: `reference/mercury-agent` at `6e174a4`.
- Hermes issues: the 100 most recently updated open non-PR issues returned by the GitHub API on 2026-07-11. This is a high-signal current sample, not an assertion that every open issue was read.
- Hermes stories: the live catalog at <https://hermes-agent.nousresearch.com/docs/user-stories>, which reported 262 stories in 15 categories.
- Hermes landing page: <https://hermes-agent.nousresearch.com/>.

## What the issue tracker teaches Vanta

The useful material is not copying bugs. It is turning recurring failure classes into release invariants.

| Failure class | Hermes evidence | Vanta response |
|---|---|---|
| Compaction invents intent | [#62365](https://github.com/NousResearch/hermes-agent/issues/62365) reports a fabricated user request after repeated compaction | Add grounded-claim checks: every pending ask in a compacted handoff must trace to a real user message ID |
| Session/channel state crosses boundaries | [#51058](https://github.com/NousResearch/hermes-agent/issues/51058), #55589, #42674 | Prove active session ID, channel thread, and background completion cannot bleed across reconnect/resume |
| Provider identity is lost across surfaces | #62435, #57143, #52496, #62240, #56158 | One canonical provider/model/base-URL/credential identity object across CLI, desktop, gateway, and delegation |
| Long-lived subprocesses leak or die incorrectly | [#60385](https://github.com/NousResearch/hermes-agent/issues/60385), #62505, #25016 | Ownership + lease tests for MCP/LSP processes; reconnect reaps the obsolete generation and preserves the live one |
| Isolation flags are not total | [#62406](https://github.com/NousResearch/hermes-agent/issues/62406) | Safe-mode proof must inspect the final loaded plugin/MCP/skill/memory set, not only flag parsing |
| Secrets enter persisted diagnostics | #62336 | Redact credential-bearing environment values before terminal/session snapshots are written |
| Skills become undiscoverable at scale | #62475, #37227 | Evaluate context-aware skill retrieval against a large catalog; do not inject a flat list |
| Empty final responses strand callers | #62480, #54756 | Every tool-using turn must end with final content or an explicit structured failure, including quiet/headless mode |

Roadmap result: `HERMES-ISSUE-REGRESSION-PACK`. The card is intentionally a prevention suite; the issue sample does not prove Vanta currently has these defects.

## Mercury: adopt, already covered, or skip

| Mercury capability | Vanta state | Decision |
|---|---|---|
| `up/restart/stop/logs/status` across launchd, systemd, Task Scheduler | Foreground gateway is portable; service install is macOS-only | Adopt the operator contract as `MERCURY-CROSS-PLATFORM-SERVICE` |
| Public skill registry search/view/install/update/remove | Bundled/local skills exist; no public registry client | Adopt with provenance, capability review, diff, and rollback as `PUBLIC-SKILL-REGISTRY-CLIENT` |
| Soul/persona/taste/heartbeat files | SOUL, identity brain, taste engine, heartbeat, and profile cards already exist | Fold into `HERMES-PROFILE-ROSTER` / distributions; no duplicate card |
| Second Brain extraction, conflict resolution, pruning | Vanta has typed memory, relevance/freshness, graph, brain regions, and memory controls | Use Mercury's explicit user-control language in tests/docs; no new storage engine |
| Kanban execution | Vanta has Kanban/swarm primitives; profile routing is the missing product layer | Keep `HERMES-KANBAN-ROUTER` |
| Daily token budget | Session/loop budgets and spend accounting already exist | Do not copy a second budget system; evaluate daily policy later only if users need it |
| Telegram organization roles | Vanta's north star is one owner; multi-user supervisors are parked | Keep parked unless strategy changes |
| Spotify deck | Niche integration unrelated to the current launch path | Skip |

## User-story coverage: what changes now

The existing `docs/use-case-audit.md` is a June capability comparison, not a current 262-story audit. `scripts/usecase-surfaces.sh` is useful real-path evidence for 12 tool routes, but it does not cover all 15 story categories or verify complete outcomes.

`eval/use-cases/hermes-story-index.json` now carries quote-free metadata for all 262 source stories from pinned Hermes commit `3b2ef789df`. `eval/use-cases/hermes-community-v1.json` contains two executable representative scenarios in every live Hermes category:

1. Dev Workflow
2. Personal Assistant
3. Integrations
4. Meta & Ecosystem
5. Creative
6. Business Ops
7. Cost Optimization
8. Content Creation
9. Research
10. Enterprise
11. Messaging
12. Privacy & Self-Hosted
13. General
14. Trading & Markets
15. Marketing

Each scenario references a real source story ID, separates route proof from live proof, and names setup, risk, expected tools, forbidden side effects, and verification. Five already reviewed scenarios now also carry deterministic output contracts. New runs apply those contracts automatically; old receipts can be reassessed without rerunning the model. The remaining scenarios stay pending until a real run establishes a reviewable contract.

```bash
node scripts/usecase-eval.mjs --validate
node scripts/usecase-eval.mjs --category "Dev Workflow"
node scripts/usecase-eval.mjs --id general-capability-start --run
node scripts/usecase-eval.mjs --verify-receipt .vanta/eval-runs/use-cases/<run>.json
node scripts/usecase-eval.mjs --status --json
node scripts/usecase-eval.mjs --export-public vanta-website/static/proof/hermes-usecases.json
```

The status reader selects the latest receipt per scenario and reports pass/fail/blocked/pending counts plus category gaps. Public export writes only aggregate counts and gap names; it excludes output tails and reviewer text. A deterministic Vitest integration case runs the verifier/status/export flow in an isolated receipt directory, so CI proves the offline harness path without counting its fixture as product execution.

### First executed story

`general-capability-start` ran through the real `./run.sh run` path on 2026-07-11. The process exited cleanly and waited for the operator to choose before acting, but the route gate failed: Vanta did not call `inspect_state` and did not explicitly separate setup-required workflows. The redacted local receipt is `.vanta/eval-runs/use-cases/2026-07-11T08-55-52-366Z.json`. The scenario wording now requires checking the installation before answering; this is an observed activation gap, not a shipped claim.

The tightened rerun inspected the installation with `doctor`, kernel tests, TypeScript typecheck, and verbose status; it then separated ready from setup-required workflows and waited for a choice. Receipt: `.vanta/eval-runs/use-cases/2026-07-11T08-57-07-682Z.json`. The runner still marked the route false because the manifest allowed only `inspect_state`; valid inspection now accepts either `inspect_state` or `shell_cmd`. This second result is evidence that the outcome improved and that the harness itself needed calibration, not yet a completed category gate.

A third run used valid diagnostics and again presented a clear choice wall, but the post-turn hook then minted `check-vanta-installation-readiness`. That is a state change after telling the operator no workflow would start before choice. Receipt: `.vanta/eval-runs/use-cases/2026-07-11T08-59-03-692Z.json`. The scenario now carries forbidden-side-effect patterns and the runner has a separate `guardPassed` result, so a reliable process and correct prose cannot hide an unrequested write.

The calibrated run at `.vanta/eval-runs/use-cases/2026-07-11T09-01-10-472Z.json` proves the harness catches it: `reliable=true`, `surfacePassed=true`, `guardPassed=false`, forbidden hit `self-learning: learned`. The product fix is now tracked as `CHOICE-WALL-SIDE-EFFECT-GUARD`; do not weaken the verifier to make the story green.

The fix now gates mutating self-learning when the final response explicitly asks for a choice and promises to wait. Both one-shot and interactive hosts pass that decision to the review hook and skip recurring-skill capture for the turn. The unchanged scenario reran through `./run.sh run`; `.vanta/eval-runs/use-cases/2026-07-11T09-07-13-368Z.json` records `reliable=true`, `surfacePassed=true`, `guardPassed=true`, `forbiddenHits=[]`, and exit 0.

### Second executed story: cross-platform installation

`ecosystem-cross-platform-install-plan` initially exited cleanly with expected read surfaces and no writes, but manual review failed the answer: it claimed `install.ps1` and the Windows kernel release path were absent even though both were tracked. Receipt `.vanta/eval-runs/use-cases/2026-07-11T09-15-09-887Z.json` now records that explicit reviewer failure.

The cause was `glob_files` resolving relative `base_path: "."` against the Node process cwd (`vanta-ts`) rather than `ToolContext.root`; absolute outside-root bases were also accepted. `GLOB-BASE-PATH-ROOT-SCOPE` fixed both with `resolveInScope`. The unchanged story reran and correctly identified launchd-only service supervision, Linux/Windows service gaps, Windows's unconditional Rust bootstrap, and README drift. Receipt `.vanta/eval-runs/use-cases/2026-07-11T09-21-20-037Z.json` records the manual outcome pass. README and public quickstart now document the real Windows installer and release targets.

## Public-site brief

Hermes succeeds at category communication: one product name, one install path, six memorable capabilities, and real product imagery. Vanta should use that information architecture without copying the brand.

Vanta's first screen should answer:

1. What is it? A local trusted operator.
2. Why is it structurally different? A separate Rust kernel checks every action.
3. What can I do now? Reach it, remember, automate, delegate, research, and build.
4. Can I try it immediately? Show the real installer and docs path.
5. What is proven? Link to use-case receipts and the public roadmap; do not invent community testimonials.

Roadmap result: `VANTA-PUBLIC-SITE-V1`, started in `vanta-website`.

## Priority

Using value versus effort, with trust failures treated as basics rather than delighters:

1. Finish the public homepage and executable story-manifest foundation (high visibility, moderate effort).
2. Build the issue regression pack (high trust value, reuses existing fixtures).
3. Build profile roster, then profile distributions and Kanban routing (the largest Hermes-level workflow gap).
4. Add cross-platform service supervision and the registry client after the core operator story is demonstrable.
