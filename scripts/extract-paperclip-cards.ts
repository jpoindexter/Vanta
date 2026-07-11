// One-off extractor: mines Paperclip (github.com/paperclipai/paperclip — "the app
// people use to manage AI agents for work") into Vanta roadmap cards. Premise:
// THEFT was never built, so the company-orchestration layer STRATEGY pillar 5
// assumed THEFT would own has no home → Vanta absorbs it. Cards deduped against
// what Vanta already shipped (heartbeat→WAKE-CONTEXT, plan→tasks→GOAL-DEPS,
// desktop app, plugin-v1, cron, audit-events); only the DELTA is filed here.
// ⚠ TENSION cards conflict with the local-first / single-ND-operator north star
// (multi-tenancy auto-parked DECISIONS 2026-06-11) — flagged + parked at horizon,
// ratify in STRATEGY.md/DECISIONS before building.
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RoadmapSchema, RoadmapItemSchema } from "../vanta-ts/src/roadmap/schema.js";
import type { RoadmapItem } from "../vanta-ts/src/roadmap/schema.js";
import { buildRoadmap } from "../vanta-ts/src/roadmap/build.js";

const P = "Paperclip extract";
const TENSION =
  "⚠ STRATEGY-TENSION (local-first / single-ND-operator; multi-tenancy auto-parked DECISIONS 2026-06-11) — ratify before building. ";

const cards: RoadmapItem[] = [
  // ── Cofounder engine: the company-orchestration layer Vanta now absorbs ──
  {
    id: "PCLIP-ORG-CHART", track: "Cofounder engine", title: "Agent org chart — roles, titles, reporting lines, permissions",
    status: "horizon", size: "L", tier: "rock", model: "opus", effort: "high", lens: "reach", updated: "2026-06-19",
    summary: `${P} (Org Chart & Agents). Give the team roster (team/*) a real hierarchy: each agent has a role, title, manager edge, permission set, and budget. Manager agents own reports; the chart drives delegation + escalation routing. This is the company layer pillar 5 assumed THEFT would own — no THEFT, so Vanta carries it.`,
    done: "An agent roster carries role/title/manager edges; /team renders the hierarchy and delegation/escalation route along it.",
  },
  {
    id: "PCLIP-AGENT-HIRE", track: "Cofounder engine", title: "Hire flow — add a budgeted, role-tagged agent (any adapter)",
    status: "horizon", size: "M", tier: "rock", model: "sonnet", effort: "medium", lens: "reach", updated: "2026-06-19", after: ["PCLIP-ORG-CHART"],
    summary: `${P} (Identity & Access / Org Chart). A "hire" path that registers an agent — any adapter/provider (Vanta itself, codex, claude-code, an HTTP bot) — with a role, job description, and monthly budget into the org, selectable for task assignment. Extends team dispatch + provider catalog.`,
    done: "vanta hire <role> --adapter <x> adds a budgeted, role-tagged agent to the roster that can be assigned tasks.",
  },
  {
    id: "PCLIP-DELEGATION-UPDOWN", track: "Cofounder engine", title: "Delegation up/down the org chart",
    status: "horizon", size: "M", tier: "pebble", model: "sonnet", effort: "medium", lens: "reach", updated: "2026-06-19", after: ["PCLIP-ORG-CHART"],
    summary: `${P} (Heartbeat / Org Chart). A manager agent assigns a subtask to a report; a report escalates a blocker upward. Builds on delegate/team/subagent + the task ledger so work flows along the hierarchy instead of flat fan-out.`,
    done: "A manager can assign a subtask to a report and a report can escalate a blocker to its manager, both recorded in the task ledger.",
  },
  {
    id: "PCLIP-CEO-CHAT", track: "Cofounder engine", title: "Leadership chat that resolves to real work objects",
    status: "horizon", size: "M", tier: "pebble", model: "sonnet", effort: "medium", lens: "reach", updated: "2026-06-19",
    summary: `${P} (CEO Chat, roadmap ⚪). A lightweight conversation with the lead agent that RESOLVES TO tracked work objects — plans, issues, approvals, decisions — instead of a freeform chat window. Improves interaction without turning Vanta into a chatbot.`,
    done: "Talking to the lead agent produces tracked issues/plans/approvals, not just replies.",
  },
  {
    id: "PCLIP-SELF-ORG", track: "Cofounder engine", title: "Self-organization — agents propose org changes within governance",
    status: "horizon", size: "L", tier: "sand", model: "sonnet", effort: "high", lens: "selfhood", updated: "2026-06-19",
    summary: `${P} (Self-Organization, roadmap ⚪). Agents propose structural changes — new recurring routines, role adjustments, delegation edits — that enter the approval queue before taking effect. Adaptive org that stays inside governance/approval boundaries.`,
    done: "An agent can propose an org change (routine/role/delegation) that enters the approval queue before it takes effect.",
  },
  {
    id: "PCLIP-ORG-LEARNING", track: "Cofounder engine", title: "Organizational learning — completed work → reusable playbooks",
    status: "horizon", size: "L", tier: "sand", model: "sonnet", effort: "high", lens: "memory", updated: "2026-06-19",
    summary: `${P} (Automatic Organizational Learning, roadmap ⚪). Completed work distills into reusable playbooks, recurring-fix patterns, and decision patterns at team scope — brain, but shared across the roster and re-injected on similar future tasks.`,
    done: "A recurring task pattern is captured as a shared playbook and re-injected into future similar tasks.",
  },
  {
    id: "PCLIP-WORKSPACE-PORTABILITY", track: "Cofounder engine", title: "Export/import an operator workspace (scrubbed bundle)",
    status: "horizon", size: "M", tier: "pebble", model: "sonnet", effort: "medium", lens: "infra", updated: "2026-06-19",
    summary: `${P} (Company Portability / companies.sh). Export and import a whole operator workspace — agents, skills, goals, routines, tasks — with secret scrubbing and id-collision handling. Reframed from Paperclip's multi-company export to single-workspace; aligns with Vanta's local-first / your-data-residency values.`,
    done: "vanta export writes a scrubbed bundle; vanta import re-creates agents/skills/goals/routines with collision handling.",
  },
  // ── Harness: reliability rails (atomic-checkout + budget-hardstop ALIGN with current pillars → next) ──
  {
    id: "PCLIP-ATOMIC-CHECKOUT", track: "Harness", title: "Atomic task checkout + execution locks (no double-work)",
    status: "next", size: "M", tier: "rock", model: "opus", effort: "high", lens: "agent-loop", updated: "2026-06-19",
    summary: `${P} (Why Paperclip is special — atomic execution; withAgentStartLock). Task checkout and budget enforcement are atomic so two parallel agents never double-work one task. Reliability for Vanta's worktree fleet — aligned regardless of the THEFT pivot.`,
    done: "Concurrent fleet workers cannot both claim the same task; the second is refused or queued, proven by a test.",
  },
  {
    id: "PCLIP-BUDGET-HARDSTOP", track: "Harness", title: "Scoped budget hard-stops — overspend auto-pauses + cancels queued",
    status: "next", size: "M", tier: "rock", model: "opus", effort: "high", lens: "agent-loop", updated: "2026-06-19",
    summary: `${P} (Budget & Cost Control; budgets.ts pauseScopeForBudget). Token/cost budgets per goal/agent/session with warning thresholds + HARD STOPS: on overspend the scope flips to paused (pauseReason:budget) and queued work is cancelled. Vanta has COST-VISIBLE display only — this is the "walk away safely" rail (the run-unwatched trust gap).`,
    done: "A goal/agent with a budget auto-pauses and cancels its queued work on overspend, not just displays the cost.",
  },
  {
    id: "PCLIP-HEARTBEAT-RUNTIME", track: "Harness", title: "Heartbeat run pipeline — coalesced queue, secret/skill injection, orphan recovery",
    status: "horizon", size: "L", tier: "rock", model: "opus", effort: "high", lens: "agent-loop", updated: "2026-06-19", after: ["PCLIP-BUDGET-HARDSTOP"],
    summary: `${P} (Heartbeat Execution). The full run pipeline beyond WAKE-CONTEXT's context-shaping: a durable wakeup queue with coalescing, budget check, workspace resolution, scoped-secret injection, skill loading, and adapter invocation as one recoverable run; orphaned runs auto-recover on restart (recoveryService → also closes LIVENESS-WATCHDOG).`,
    done: "A single wakeup runs the coalesced budget→workspace→secret→skill→adapter pipeline and auto-recovers an orphaned run on restart.",
  },
  {
    id: "PCLIP-COST-ATTRIBUTION", track: "Harness", title: "Multi-dimensional cost attribution (by goal/agent/provider/model)",
    status: "horizon", size: "M", tier: "pebble", model: "sonnet", effort: "medium", lens: "agent-loop", updated: "2026-06-19",
    summary: `${P} (Budget & Cost Control). Token/$ rollups attributed by goal, agent, project, provider, and model over a window — Vanta's pricing.ts is per-turn only. Feeds budgets + operator visibility.`,
    done: "/usage breaks spend down by goal/agent/provider/model over a chosen window.",
  },
  {
    id: "PCLIP-APPROVAL-STAGES", track: "Harness", title: "Staged review/approval as first-class workflow steps",
    status: "horizon", size: "M", tier: "pebble", model: "sonnet", effort: "medium", lens: "agent-loop", updated: "2026-06-19",
    summary: `${P} (Governance & Approvals / Agent Reviews). Execution policies with named review + approval STAGES — reviewer routing, change-requests, approval gates — beyond Vanta's per-action y/n. Sits on the kernel approval queue.`,
    done: "A task can require a named review stage that routes to a reviewer and blocks completion until approved.",
  },
  {
    id: "PCLIP-CONFIG-REVISION", track: "Harness", title: "Config/agent/skill revisioning with safe rollback",
    status: "horizon", size: "M", tier: "pebble", model: "sonnet", effort: "medium", lens: "agent-loop", updated: "2026-06-19",
    summary: `${P} (Governance with rollback). Config, agent, and skill changes are versioned and safely roll-back-able; a bad change reverts cleanly. Pairs with SELFHARNESS-SANDBOX (test a change before it lands).`,
    done: "A config change is versioned and `vanta config rollback` restores the prior revision.",
  },
  {
    id: "PCLIP-ENFORCED-OUTCOMES", track: "Harness", title: "Enforced outcomes — tasks resolve to a typed result, not a status",
    status: "horizon", size: "M", tier: "pebble", model: "sonnet", effort: "medium", lens: "agent-loop", updated: "2026-06-19",
    summary: `${P} (Enforced Outcomes, roadmap ⚪). Tasks/approvals resolve to a concrete outcome — merged code, published artifact, shipped doc, explicit decision — not a vague status update. Stricter than /verify: 'done' requires the outcome object exist.`,
    done: "A task cannot close without a typed outcome object; status 'done' requires the outcome be present.",
  },
  {
    id: "PCLIP-MAXIMIZER-MODE", track: "Harness", title: "Maximizer mode — higher-autonomy execution under hard governance",
    status: "horizon", size: "L", tier: "rock", model: "opus", effort: "high", lens: "agent-loop", updated: "2026-06-19", after: ["PCLIP-BUDGET-HARDSTOP"],
    summary: `${P} (MAXIMIZER MODE, roadmap ⚪). A higher-autonomy profile: aggressive delegation, deeper follow-through, stronger operating loops with explicit budgets, visibility, and governance — "more output per supervisor", not hidden autonomy. Builds on Ralph loop + fleet + budget hard-stop.`,
    done: "A maximizer run delegates + follows through across multiple tasks under a hard budget with a visible activity trail, ending in verified outcomes.",
  },
  {
    id: "PCLIP-DEEP-PLANNING", track: "Harness", title: "Deep planning — revisionable plan docs with a pre-execution review gate",
    status: "horizon", size: "L", tier: "pebble", model: "sonnet", effort: "high", lens: "agent-loop", updated: "2026-06-19",
    summary: `${P} (Deep Planning, roadmap ⚪). Strategy-heavy work gets a revisionable plan/issue document and a review loop BEFORE execution starts. Extends /planmode + VANTA-PLAN-MODE-V2 with durable, revisable plan artifacts.`,
    done: "A strategy task produces a revisionable plan doc that must pass a review gate before execution starts.",
  },
  {
    id: "PCLIP-EXEC-WORKSPACES-RUNTIME", track: "Harness", title: "Per-run runtime services — dev servers + preview URLs on worktrees",
    status: "horizon", size: "M", tier: "pebble", model: "sonnet", effort: "medium", lens: "coding", updated: "2026-06-19",
    summary: `${P} (Workspaces & Runtime). On top of the existing worktree fleet: resolve per-run runtime services — dev servers, preview URLs — so an agent's work is previewable and bound to its execution workspace.`,
    done: "A run can start a dev server / preview URL bound to its worktree and surface the URL on the task.",
  },

  // ── Operator: the work surface (ticketing, artifacts, queues, routines, activity) ──
  {
    id: "PCLIP-TICKETS", track: "Operator", title: "Ticket/issue system — links, comments, attachments, inbox state",
    status: "horizon", size: "L", tier: "rock", model: "opus", effort: "high", lens: "reach", updated: "2026-06-19",
    summary: `${P} (Work & Task System). A first-class issue object: company/project/goal/parent links, threaded comments, documents, attachments, labels, inbox state — the work-tracking surface above Vanta goals + GOAL-DEPS. "It looks like a task manager."`,
    done: "Issues exist as first-class objects with goal/parent links, comments, attachments, and inbox state, viewable on a board.",
  },
  {
    id: "PCLIP-WORK-PRODUCTS", track: "Operator", title: "Artifacts & work products — first-class agent outputs",
    status: "horizon", size: "M", tier: "pebble", model: "sonnet", effort: "medium", lens: "reach", updated: "2026-06-19",
    summary: `${P} (Artifacts & Work Products, roadmap ⚪). Make outputs first-class: generated artifacts, previews, deployable outputs, and the handoff from "agent did work" to "here is the result" — visible without reading the transcript.`,
    done: "A completed task carries linked work-product artifacts (files/preview/deploy) viewable without reading the transcript.",
  },
  {
    id: "PCLIP-WORK-QUEUES", track: "Operator", title: "Work queues — continuous routing for repeatable inputs",
    status: "horizon", size: "M", tier: "pebble", model: "sonnet", effort: "medium", lens: "reach", updated: "2026-06-19",
    summary: `${P} (Work Queues, roadmap ⚪). Queue-style work streams for repeatable inputs — support, triage, review, backlog intake — routed continuously to assigned agents instead of a one-off workflow per item.`,
    done: "A queue accepts repeated inputs and routes each to an assigned agent without a one-off workflow per item.",
  },
  {
    id: "PCLIP-ROUTINES-ISSUE", track: "Operator", title: "Routines that create a tracked issue + wake the agent (catch-up policy)",
    status: "horizon", size: "M", tier: "pebble", model: "sonnet", effort: "medium", lens: "reach", updated: "2026-06-19",
    summary: `${P} (Routines & Schedules). Beyond Vanta cron: each routine run CREATES A TRACKED ISSUE and wakes the assigned agent, with cron/webhook/API triggers and concurrency + catch-up policies (so missed runs after downtime are handled).`,
    done: "A routine fires on schedule/webhook, creates a tracked issue, wakes its agent, and honors a catch-up policy after downtime.",
  },
  {
    id: "PCLIP-ACTIVITY-FEED", track: "Operator", title: "Operator activity feed — queryable timeline over events",
    status: "horizon", size: "M", tier: "pebble", model: "sonnet", effort: "medium", lens: "reach", updated: "2026-06-19",
    summary: `${P} (Activity & Events). An operator-facing, filterable timeline over events.jsonl: mutating actions, heartbeat state changes, cost events, approvals, comments, work products — "audit what happened and why" without reading raw jsonl.`,
    done: "/activity shows a filterable timeline of who/what/why across runs, not raw jsonl.",
  },
  {
    id: "PCLIP-MOBILE-CONTROL", track: "Operator", title: "Mobile control — review + approve + pause runs from a phone",
    status: "horizon", size: "M", tier: "sand", model: "sonnet", effort: "medium", lens: "reach", updated: "2026-06-19", after: ["VANTA-CHANNEL-PERMISSIONS"],
    summary: `${P} (Mobile Ready). Monitor and manage autonomous runs from a phone — list active runs, read a work product, approve/pause — via the comms relay. Extends VANTA-CHANNEL-PERMISSIONS from notify-only to control.`,
    done: "From a phone channel you can list active runs, read a work product, and approve/pause — not just receive notifications.",
  },

  // ── Extensibility: plugin workers, scoped secrets, sandboxed backends ──
  {
    id: "PCLIP-PLUGIN-WORKERS", track: "Extensibility", title: "Out-of-process plugin workers + capability-gated host services",
    status: "horizon", size: "L", tier: "pebble", model: "sonnet", effort: "high", lens: "infra", updated: "2026-06-19",
    summary: `${P} (Plugins). Grow Vanta's in-process plugin framework (tools/commands only) into out-of-process plugin workers with capability-gated host services, job scheduling, and UI contributions — extend without forking, isolated from the core.`,
    done: "A plugin runs in its own worker process, requests capability-gated host services, schedules jobs, and contributes a UI panel.",
  },
  {
    id: "PCLIP-SCOPED-SECRETS", track: "Extensibility", title: "Scoped secret injection — secrets reach only the run that needs them",
    status: "horizon", size: "M", tier: "pebble", model: "sonnet", effort: "medium", lens: "infra", updated: "2026-06-19",
    summary: `${P} (Secrets & Storage). Instance + per-agent encrypted secrets injected into a run ONLY when that scoped run explicitly needs them — kept out of every other run's prompt and logs. Tightens Vanta's kernel secret handling with per-run scoping.`,
    done: "A run receives a named secret only when scoped to it; it never appears in the prompt or logs of other runs.",
  },
  {
    id: "PCLIP-SANDBOX-AGENTS", track: "Extensibility", title: "Remote/sandboxed agent backends (e2b/cloud-VM) under the kernel",
    status: "horizon", size: "L", tier: "sand", model: "sonnet", effort: "high", lens: "infra", updated: "2026-06-19", after: ["RUN-ANYWHERE"],
    summary: `${P} (Cloud / Sandbox agents, roadmap ⚪). ${TENSION}Run agents in remote/sandboxed envs (e2b/Novita/cloud-VM) under the same kernel-gated control model. Sequence AFTER RUN-ANYWHERE; prefer user-controlled infra over third-party SaaS sandboxes to keep local-first.`,
    done: "A run executes in a remote sandbox with the kernel enforcing scope identically to local, selected via the run-anywhere backend picker.",
  },
];

async function main() {
  const root = resolve(import.meta.dirname, "..");
  const src = join(root, "roadmap.json");
  const data = RoadmapSchema.parse(JSON.parse(await readFile(src, "utf8")));
  const existing = new Set(data.items.map((i) => i.id.toLowerCase()));

  let added = 0;
  const skipped: string[] = [];
  for (const c of cards) {
    if (existing.has(c.id.toLowerCase())) {
      skipped.push(c.id);
      continue;
    }
    data.items.push(RoadmapItemSchema.parse(c)); // throws actionably on a bad shape
    existing.add(c.id.toLowerCase());
    added++;
  }

  data.updated = new Date().toISOString().slice(0, 10);
  await writeFile(src, JSON.stringify(data, null, 2) + "\n", "utf8");
  try {
    await buildRoadmap(root);
  } catch (err) {
    console.error("html rebuild skipped:", err instanceof Error ? err.message : err);
  }
  console.log(`PCLIP extract: added ${added}, skipped ${skipped.length}${skipped.length ? " (" + skipped.join(", ") + ")" : ""}`);
  console.log(`roadmap.json now has ${data.items.length} items.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
