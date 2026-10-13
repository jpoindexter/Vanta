# Company engine surface (DN-18 inventory)

Date: 2026-10-13. Branch: `claude/desktop-company-api-20261013`.
Scope: what the shipped `PCLIP-*` / `COFOUNDER-*` engine exposes, what the desktop
server could read or write before this track, and which worker runtimes the engine
can really launch. Source of truth is the code at the branch base (`8c354ac0`).
Every row below was read from source, not assumed.

Boundary (DECISIONS 2026-06-19): multi-agency (one owner, one kernel) is in;
multi-tenancy (multi-company, board users, invites, RBAC, billing) is out and is
not added here.

Legend. READY = pure read and write functions exist and take an `env` or `dataDir`
argument, so a route can call them directly. NEEDS-ADAPTER = the logic exists but
needs wiring (a live runner, the kernel, an injected seam) before a route can use
it. MISSING = no engine support; a route would have to invent behaviour.

Path roots: `~/.vanta` is `resolveVantaHome(env)` (honours `VANTA_HOME`).
`<proj>/.vanta` is `dataDirFor(root)` (project data dir). The split matters: team,
departments, work products and OKRs live under the home; tickets, budgets, the
spend ledger, heartbeat runs and cron live under the project.

## Capability table

Desktop column: before this track no `src/desktop/*` or `src/public-api/*` file
touched tickets, team, budgets, OKRs, work products or departments (grep of both
trees). The only company-adjacent route was `GET /api/schedules` (raw cron rows).
So the answer is "no" for every row and is not repeated.

| Card | Module | Store | Read fn | Mutating fn | CLI / tool | Status |
|---|---|---|---|---|---|---|
| PCLIP-ORG-CHART | `team/org-chart.ts`, `team/store.ts` | `~/.vanta/team.jsonl` (`managerId` on Worker) | `readTeam`, `latestWorkers`, `buildOrgTree`, `resolveDelegateTarget` | `setManager` (pure), persisted with `appendTeam` | `/team` REPL renders the tree; no CLI sets a manager | READY (no persisting wrapper for `setManager`; a route composes it) |
| PCLIP-AGENT-HIRE | `team/hire.ts` | `team.jsonl` | `readTeam` | `hireAgent` (pure) then `appendTeam` | `vanta hire <role> --adapter <id> [--budget] [--title]` | READY. Caveat: `adapter` and `budgetUsd` are stored but no runner reads them (see runtime verdict) |
| PCLIP-DELEGATION-UPDOWN | `team/delegation.ts` | team-tasks ledger | `resolveDelegateTarget`, `resolveEscalateTarget` | `planDelegateDown`, `planEscalateUp`, then `assignTask` + `appendTask` | `team` tool actions `delegate_down`, `escalate_up` | READY (tool only; no CLI) |
| PCLIP-CEO-CHAT | `cofounder/leadership-chat.ts` | `~/.vanta/leadership-work.json` | `readLeadershipWork` | `recordLeadershipMessage` | `vanta lead` | READY (not in this track's route list) |
| PCLIP-SELF-ORG, COFOUNDER-SELF-ORGANIZATION | `cofounder/self-org.ts`, `proposal-model.ts` | `~/.vanta/proposals.json`, `org-changes.json` | `readProposals`, `readAppliedChanges`, `pendingProposals` | `proposeFromSignals`, `ratifyProposal`, `rejectProposal`, `appendAppliedChange` | `vanta proposal` | READY (not routed here; see open questions) |
| PCLIP-ORG-LEARNING, COFOUNDER-ORG-LEARNING | `cofounder/org-learning.ts` | `~/.vanta/playbooks.json` | `readPlaybooks`, `matchPlaybook` | `extractPlaybook`, `recordPlaybook` | `vanta playbook` | READY (not routed here) |
| PCLIP-WORKSPACE-PORTABILITY | `workspace/portability.ts` | none (bundle file) | `parseBundle` | `scrubBundle`, `mergeCollection` | `vanta workspace` | READY (not routed here) |
| PCLIP-ATOMIC-CHECKOUT | `team/checkout.ts` | `<proj>/.vanta/locks/tasks/*` | `lockPath` | `checkoutTask`, `withTaskCheckout` | used by `fleet` only | READY. Routes reuse `withTaskCheckout` |
| PCLIP-BUDGET-HARDSTOP | `budget/types.ts`, `store.ts`, `enforce.ts` | `<proj>/.vanta/budgets.json` | `readBudgets`, `listBudgets`, `getBudget` | `setBudgetLimit`, `recordSpend`, `enforceScopeBudget` | `budget` tool; `vanta dept` sets `dept:<id>` | READY. The hard stop only pauses `loop:<id>` scopes. Nothing records spend against `agent:<id>` or `dept:<id>` today |
| PCLIP-HEARTBEAT-RUNTIME | `heartbeat/runtime.ts`, `run-cmd.ts` | `<proj>/.vanta/heartbeat-runs.json` | `loadRuns` | `runHeartbeat`, `recoverOrphans` | `vanta heartbeat` | READY for the run log. NEEDS-ADAPTER for workers: the pipeline drains loop wakes (`peekLoopWakeCount`), not team tasks, and no per-worker heartbeat exists |
| PCLIP-COST-ATTRIBUTION | `cost/ledger.ts`, `attribution.ts` | `<proj>/.vanta/spend-ledger.jsonl` | `listSpend`, `summarizeSpend`, `filterSpendSince` | `appendSpend`, `recordTurnSpend` | none beyond the readers | READY. `agent` is `interactive` or `gateway`; no call site writes a worker id |
| PCLIP-APPROVAL-STAGES | `team/review-stage.ts` | stages live on the task row in `team-tasks.jsonl` | `blockingStages`, `reviewQueue` | `requireStage`, `decideStage`, gate inside `advanceTask` | `team` tool actions `require_review`, `review`, `reviews` | READY (tool only; no CLI) |
| PCLIP-CONFIG-REVISION | `cli-dx/config-revisions.ts` | `<proj>/.vanta/config-revisions.jsonl` | `listRevisions`, `getRevision` | `appendRevision` | `vanta config rollback` | READY but `.env` only: `config rollback` writes a revision body back into `.env`, so company state must not be stored there |
| PCLIP-ENFORCED-OUTCOMES, COFOUNDER-ENFORCED-OUTCOME | `cofounder/outcome-contract.ts`, `outcome-gate.ts`, `tools/task-outcome-probe.ts` | `outcome` field on the task row | `canCloseTask`, `resolveTaskArtifactProbe(taskId, env)` | `requireOutcome`; gate inside `advanceTask` | none (gate runs inside `team advance`) | READY. The gate accepts any artifact whose `sourceTaskId` matches; it does not check `approved` |
| PCLIP-TICKETS | `tickets/store.ts`, `board.ts` | `<proj>/.vanta/tickets.json` | `listTickets`, `getTicket` | `createTicket`, `addComment`, `addAttachment`, `setInbox`, `setStatus`, `linkTicket` | `tickets` tool, `/tickets` REPL | READY. Tickets are not linked to tasks or workers; comments have no author |
| Team task ledger (the assignable unit) | `team/tasks.ts`, `idle.ts` | `~/.vanta/team-tasks.jsonl` | `readTasks`, `latestTasks`, `deriveWorkerState` | `assignTask`, `advanceTask`, `appendTask` | `team` tool, `vanta agents` | READY. Statuses: assigned, running, done, blocked, stopped, removed. There is no "failed" status |
| PCLIP-WORK-PRODUCTS, COFOUNDER-WORK-PRODUCTS | `cofounder/work-products.ts` | `~/.vanta/work-products.json` | `readWorkProducts(env)`, `bySourceTask`, `byDepartment`, `byApproval` | `recordWorkProduct`, `setApproved`, `writeWorkProducts` | `vanta library`, `team` tool `artifact` | READY |
| COFOUNDER-OUTCOME-APPROVAL | `cofounder/outcome-approval.ts` | `~/.vanta/artifact-reviews.json` | `listPendingArtifacts`, `readRevisions` | `approveArtifact`, `requestRevision`, `appendRevision` | `vanta review` (its `rerunTask` is a no-op by default) | READY. Live re-run is wired nowhere; a route must supply `rerunTask` |
| COFOUNDER-DEPARTMENT-UNIT | `cofounder/department.ts`, `department-model.ts` | `~/.vanta/departments.json` | `readDepartments` | `addDepartment`, `writeDepartments` | `vanta dept add|list|status|assign` | READY for the store. Department status and the tick need kernel goals (`getGoals`) |
| COFOUNDER-DEPT-HANDOFF | `cofounder/handoff.ts` | `~/.vanta/handoffs.json` | `readHandoffs`, `contextForDepartment` | `recordHandoff`, `writeHandoffs` | `vanta handoff` | READY (not routed here) |
| COFOUNDER-CADENCE-LOOP | `cofounder/cadence.ts`, `cadence-deps.ts`, `cli/company-cmd.ts` | none (reads dept, tasks, budget, goals) | `buildCompanyTickDeps` sources | `runCompanyTick` | `vanta company tick` | NEEDS-ADAPTER. `dispatch` only flips `assigned` to `running`; nothing launches a worker. Needs kernel goals and `dept:<id>` budgets |
| COFOUNDER-OKR-METRICS | `cofounder/okr.ts`, `okr-store.ts` | `~/.vanta/okrs.json` | `readObjectives`, `objectiveProgress`, `furthestFromTarget` | `addObjective`, `updateKeyResult`, `writeObjectives` | `vanta okr` | READY |
| COFOUNDER-SKILL-EXCHANGE | `cofounder/skill-exchange.ts` | `~/.vanta/skill-exchange.json` | `readExchange`, `skillsForDepartment` | `publishSkill`, `adoptSkill` | `vanta exchange` | READY (not routed here) |
| COFOUNDER-DELEGATED-AUTHORITY | `cofounder/delegated-authority.ts`, `authority-model.ts` | `~/.vanta/authority-grants.json`, `authority-audit.jsonl` | `readGrants`, `readAuditLog` | `grantAuthority`, `revokeAuthority`, `checkDelegated` | `vanta authority` | READY for CLI use. The kernel Ask-tier call site is not wired (card note: DELEGATED-AUTHORITY-WIRE) |
| COFOUNDER-COMPANY-TEMPLATE | `cofounder/company-template.ts` | template file | `exportCompany` | `importCompany` | `vanta org export|import` | READY (not routed here) |
| PCLIP-MAXIMIZER-MODE | `maximizer/runtime.ts`, `trail.ts` | `<proj>/.vanta/maximizer/<run>.jsonl` | `readActivity` | `appendActivity` | `maximizer` tool | READY (per-run trail only) |
| PCLIP-ACTIVITY-FEED | `activity/feed.ts` | `<proj>/.vanta/events.jsonl` (kernel written, hash chained) | `parseActivity`, `filterActivity` | none: the kernel writes the file via `safety.logEvent` | `/activity` | READY to read. Appending needs a live kernel client |
| PCLIP-ROUTINES-ISSUE | `schedule/cron.ts`, `runner.ts` | `<proj>/.vanta/cron` (TSV) | `loadCron` | `addCron`, `authorizeCron` | `vanta cron` | READY. Already exposed raw by `GET /api/schedules` |
| PCLIP-WORK-QUEUES | `queues/work-queue.ts` | `<proj>/.vanta/work-queues/<name>*` | `loadQueue`, `listQueues` | `defineQueue`, push and claim | `vanta queue` | READY (not routed here) |
| PCLIP-MOBILE-CONTROL | `gateway/mobile-control.ts` | `<proj>/.vanta/mobile-control.json` | `loadMobileRuns` | `startMobileRun`, `pauseMobileRun` | gateway chat commands | READY (a separate run list, not unified with team tasks) |
| PCLIP-EXEC-WORKSPACES-RUNTIME | `fleet/runtime.ts` | fleet report under `<proj>/.vanta/fleets/` | `loadFleetReport` | `vanta runtime start` | `vanta runtime` | READY (not routed here) |
| PCLIP-PLUGIN-WORKERS | `plugins/worker.ts` | plugin dir | n/a | n/a | plugin manifest | MISSING as company workers: sandboxed Node helpers with log, storage, schedule and panel capabilities; no model loop, no tasks |
| PCLIP-SCOPED-SECRETS | `secrets/scope.ts` | secret grants | `secretsForScope` | `grantSecret` | secrets CLI | READY (never returned by company routes) |
| PCLIP-SANDBOX-AGENTS | exec backend adapters | settings | n/a | n/a | setup picker | READY as an exec backend, not a worker type |
| PCLIP-DEEP-PLANNING, COFOUNDER-ENGINE-SURVEY, IDEATION-METHODS, ANTI-SLOP, MEMORY-HOOKS | planning, survey, `solutioning/*`, `verify/*`, `brain/*` | none | n/a | n/a | n/a | not company runtime surfaces |

Net: every capability the route list needs has READY store functions. Four gaps
need glue in `src/desktop/`:

1. Tickets, team tasks and workers are three unlinked stores. The route layer
   defines the join (a ticket's id equals its team task's id) instead of changing
   the engine.
2. No engine path launches a worker from a task. The cadence `dispatch` only flips
   status. A `WorkerRuntime` port is added in the desktop layer.
3. Nothing records spend per worker, so cost per worker and `agent:<id>` hard stops
   need a recording call after each run.
4. `events.jsonl` can only be appended through a live kernel client, so the company
   activity feed needs its own append-only log (plus a best-effort kernel event).

## Worker runtimes: what the engine can launch today

Question (DN-15 "VERIFY first"): which of Vanta native, Claude Code, Codex, Hermes
and others can the company engine launch as workers today?

| Runtime | Launchable as a task worker today? | How it is invoked | Progress, usage, cost back | Not supported |
|---|---|---|---|---|
| Vanta native loop | Yes, one path: `team` tool action `run` -> `tools/team-run.ts doRun` -> `spawnSubagent` (in-process loop, kernel-gated tools, `delegate` and `team` removed from its registry so it cannot fan out). `fleet` also runs `spawnSubagent` per git worktree | In-process. Needs a live agent session (provider, kernel client, registry) | Task ledger gets `done` or `blocked` with a 500 char result. `spawnSubagent` returns token `usage` and `workerEvidence` (tools, duration, model); `doRun` discards both and writes no spend row. Progress is the footer pill only | The hired worker's `adapter`, `model` and `budgetUsd` are ignored: `doRun` resolves the provider from the parent's active model (`resolveProvider(teammateEnv(...))`). A grep for `.adapter` across team, tools, fleet, cofounder and queues finds only the hire writer and one CLI print |
| Vanta native on another provider (`delegate` or `swarm` with `provider`, `model`) | Yes, through those tools only, not through the ticket ledger | In-process, `providerOverrideEnv(env, provider, model)` | `delegate` persists a delegation receipt with `usage` and `estimatedCostUsd` (an estimate from the pricing table) | Not connected to workers or tickets |
| `claude-code` and `codex` provider ids | Only as LLM backends inside the Vanta loop. `claude-code` uses a Claude subscription token; `codex` uses ChatGPT OAuth. They are model backends, not the Claude Code or Codex agent harnesses | `resolveProvider` | `billingMode` is `included`, so cost is not metered | They do not run the real `claude` or `codex` CLI or its tool harness |
| Claude Code CLI (`claude -p`) as an agent | Yes, but only as the `call_agent` and `build_with_agent` tools, never from the task ledger. Approval gated, effect-gate wrapped, optional Docker box for `autonomous` | Subprocess via `runExternalAgent` (`agents/external-cli.ts`); coding mode adds `--permission-mode acceptEdits --output-format stream-json` | Stream-json lines give live progress text and a final result; `parseClaudeStreamLine` ignores usage and cost in the result event, so cost is not reported | No token or cost capture, no task or worker link, no work-product recording |
| Codex CLI (`codex exec`) | Same: `call_agent` only | Subprocess, text stdout | stdout lines only | Same |
| Gemini CLI, cursor-agent, opencode | Same: built-in argv in `external-cli.ts` | Subprocess | stdout only | Same |
| Hermes | No built-in. `grep -i hermes` finds only migration importers and roadmap proof tooling. It could be declared as a custom CLI in `~/.vanta/agents.json` (cmd, args, modelFlag) and then called through `call_agent` | Subprocess, if declared | stdout only | Not a worker runtime; no adapter |
| Plugin workers | No. `plugins/worker.ts` hosts sandboxed Node helpers | n/a | n/a | They run no model loop and take no tasks |
| tmux fleet (`fleet tmux`) | Layout and `send-keys` only: types a launch command into panes | tmux subprocess | none | A launcher for a human-visible terminal, not a task runtime |
| Sandbox backends (Docker, Modal, Daytona) | An execution location for shell tools, not a worker type | `ExecBackendAdapter` | n/a | n/a |

Consequences for the desktop:

- The only worker the ticket ledger can drive is the Vanta native loop, and only
  when something calls `doRun`. Nothing calls it automatically: the cadence tick
  and `vanta heartbeat` do not run tasks.
- "Hire a Claude Code worker" or "hire a Codex worker" is not possible today in the
  sense of launching those harnesses from a ticket. The hire `adapter` accepts
  provider ids only (`providerById`), so `claude-code` and `codex` mean "run the
  Vanta loop on that model backend".
- Cost per worker is unrecorded today. The honest labels for the budget routes are
  `estimated` (tokens times the pricing table; native loop), `not-reported`
  (external CLIs and subscription providers) and `reported` (a runtime returned a
  dollar figure). `reported` has no producer in the engine today.

This track adds a `WorkerRuntime` port and one native adapter. It does not add
external CLI workers; that is an open question at the end of this file.
