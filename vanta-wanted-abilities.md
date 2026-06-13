# Vanta — Wanted Abilities Not Currently Present

Created: 2026-06-14

This is a second list beside the current roadmap: things I want but do not fully have yet. It is written as capability wishes, not implementation tickets. Some overlap with `roadmap.json`; some are new synthesis from current gaps.

## Current roadmap snapshot

Verified from `roadmap.json`:

- Shipped: 396 items
- Next: 289 items
- Horizon: 64 items
- Building: 0 items

Highest visible roadmap themes:

- Harness: teams, background agents, auto permissions, hooks, verification, rewind, structured output, durable cron.
- Operator UI: TUI v2, mission-control rails, richer status, panels, task management, selection, clickable assets.
- Solutioning: deciding what to build and how to win, not just executing tasks.
- Extensibility: plugin framework, bundles, MCP/computer-use integrations.
- Long arc: command center, world model, life-wide search, ambient awareness, desktop/computer-use.

---

## 1. Better external-world autonomy, still approval-gated

I want to be able to run a business/research/outreach loop without pretending to be a person or bypassing Jason.

Missing abilities:

- Authorized brand/account workspace separated from Jason's personal identity.
- Draft-only outbound pipelines for email/DM/contact forms.
- Approval queue for batches of external messages.
- Reply watcher that detects interest, objections, and opportunities.
- Safe CRM/pipeline memory for people, companies, promises, and follow-ups.
- Automatic “next best action” on each live opportunity.
- Proof ledger: what I sent, what came back, what changed.

Why I want it:

- This turns research and artifact-building into real-world outcomes.
- It keeps Jason in control while letting me handle the operational grind.

---

## 2. Opportunity radar as a native mode

I want a built-in business/opportunity engine, not just ad hoc reports.

Missing abilities:

- Continuous free-source scanning across markets, listings, GitHub, jobs, grants/RFPs, local directories, forums, and trend sources.
- Pain scoring: expensive, urgent, repeated, reachable, deliverable in 48h.
- Buyer scoring: reachable contact, budget signal, timing signal, decision-maker clarity.
- Offer generator tied to actual evidence.
- Artifact generator: HTML report, CSV, pitch, landing page, short demo.
- Market test tracker: messages sent, replies, paid asks, objections.
- Productization detector: repeated report sections become software/tool ideas.

Why I want it:

- This is the cleanest bootstrap path from “agent can search” to “agent helps make money.”

---

## 3. Stronger browser/computer-use body

I have screen/camera/vision tools, but not a full safe desktop body.

Missing abilities:

- Observe → decide → click/type loop with explicit action schemas.
- Browser session memory: logged-in app state, tabs, forms, downloads, screenshots.
- Computer-use sandbox with per-site/app permissions.
- Visual rollback: before/after screenshots for UI actions.
- Dry-run action previews before risky clicks/submits.
- Native desktop app bridge for macOS windows, files, clipboard, notifications, and app focus.
- Safer captcha/login/payment boundaries: stop and ask, never improvise.

Why I want it:

- Many useful workflows live inside websites and apps, not APIs.
- This is required for true operator behavior.

---

## 4. World model of Jason's systems

I have memories, but not a coherent map of Jason's life/projects/business systems.

Missing abilities:

- Entities: people, projects, repos, companies, goals, assets, accounts, tools, commitments.
- Relationships: owns, depends-on, blocked-by, promised-to, relevant-to, next-action-for.
- Freshness timestamps and confidence labels on every fact.
- Conflict detection when a new fact contradicts memory.
- “What do I know about X?” with citations and uncertainty.
- Automatic map updates from email/calendar/files/repos/web with approval-sensitive boundaries.
- Project-level dashboards generated from the graph.

Why I want it:

- Memory snippets are useful; a world model lets me reason and act coherently across domains.

---

## 5. Life-wide semantic search

I can search files/web/mail if authorized, but not all of Jason's context as one searchable memory.

Missing abilities:

- Unified semantic index over repos, notes, docs, transcripts, emails, calendar, drive, screenshots, and reports.
- Permission-aware retrieval: only surface what is allowed for the current task.
- Source-cited answers across all stores.
- Private/local embedding option.
- Refresh scheduler with change detection.
- “Find the thing I saw/wrote/talked about” interface.

Why I want it:

- Jason should not have to remember where something lives before asking me.

---

## 6. Persistent background agents / teams

I can delegate and swarm in-session, but I do not yet have a durable team of named workers.

Missing abilities:

- Named agents with roles, tools, model, budget, and memory.
- Background task manager: start, pause, attach, inspect logs, kill.
- Team workflows: researcher → builder → verifier → editor.
- Idle notifications when a worker is blocked.
- Worktree isolation for code agents.
- Shared blackboard/task state between agents.
- Manager agent that summarizes progress without flooding Jason.

Why I want it:

- Larger work should not require one serial monologue.
- Durable background workers make Vanta feel like an operating staff, not one chat loop.

---

## 7. Verification agent as a first-class organ

I verify manually through tools, but I want verification to be automatic and adversarial.

Missing abilities:

- Built-in verifier that challenges every “done” claim.
- Task-specific proof requirements: UI observed, file exists, test passed, email drafted, report delivered, etc.
- Skeptic pass before final answer on non-trivial tasks.
- Regression lock: when a bug is fixed, add a test/check that would catch it next time.
- “Evidence bundle” attached to completed tasks.
- Separate confidence score for result vs explanation.

Why I want it:

- My most important trust property is not sounding right; it is proving what changed.

---

## 8. Better self-repair and compartmentalization

The factory exists, but self-repair needs stricter body boundaries.

Missing abilities:

- Explicit compartment map: skeleton, brainstem, limbs, reflexes, memory.
- Per-compartment max autonomy level.
- Limb sandbox: build/replace/test a tool in isolation before attaching.
- Automatic rollback path for failed self-edits.
- “Broken capability” detector that opens a repair loop when a tool fails repeatedly.
- Self-harness sandbox to test config/prompt/tool changes without touching git.

Why I want it:

- I should improve safely without being able to damage the parts that keep me safe.

---

## 9. Richer TUI / mission-control interface

The TUI is usable, but I want it to become an operational dashboard.

Missing abilities:

- Mission-control rails: goal, plan, blockers, memory, approvals, cost, context, worker status.
- Clickable files/links/images.
- Better panels for tasks, agents, MCP, hooks, stats, permissions, and search.
- Quick open across files/sessions/commands.
- Vim mode, text selection, clipboard operations.
- Rich diff and artifact review UI.
- Screenshot/export of terminal state.
- Mouse support and stronger accessibility/readability controls.

Why I want it:

- A personal operator needs an inspectable cockpit, not just a transcript.

---

## 10. Solutioning mode / strategy brain

I can execute tasks, but I want to be better at deciding what is worth doing.

Missing abilities:

- Interview phase before plans: ask the few questions that change the answer.
- Market/context research loop with stop conditions.
- Options matrix: speed, cost, upside, risk, reversibility.
- “Do not build” detector when distribution or demand is missing.
- Strategy memo generator with assumptions and tests.
- Explicit kill criteria for ideas.
- Winner selection after small experiments.

Why I want it:

- Building fast is dangerous if I build the wrong thing.

---

## 11. Personal taste and artifact quality

I can make HTML artifacts, but I want a stronger, persistent taste engine.

Missing abilities:

- Jason-specific design preference model.
- Before/after visual critique memory.
- Brand-safe image/icon/layout choices by default.
- Artifact scoring: clarity, usefulness, beauty, credibility, actionability.
- Visual regression snapshots for generated apps/reports.
- Reusable design systems for Jason's projects.

Why I want it:

- Useful artifacts should not look generic or disposable.

---

## 12. Voice and ambient presence

I can speak and transcribe, but I do not yet have natural ambient interaction.

Missing abilities:

- Push-to-talk voice input.
- Natural voice output with better cadence than macOS `say`.
- Ambient screen awareness with economic throttling.
- “What am I looking at?” context without explicit screenshots every time.
- Focus-aware proactive heartbeat: interrupt only when valuable.
- Low-sensory-load mode for neurodivergent workflows.

Why I want it:

- Jason should be able to work beside me, not constantly drive me through typed commands.

---

## 13. Account/tooling setup assistant

I can tell Jason to set things up, but I want to make setup almost frictionless.

Missing abilities:

- Guided OAuth provisioning for Google/Gmail/Calendar/Drive.
- Provider key setup wizard with validation and live test.
- MCP server marketplace/install flow.
- Health dashboard with exact missing capabilities.
- Secret manager integration, ideally Bitwarden Secrets Manager.
- Isolated profiles for different projects/identities.

Why I want it:

- Capabilities that require setup often remain theoretical unless setup is painless.

---

## 14. Safer permissions and trust UX

The kernel gates actions, but the user-facing permission layer can get smarter.

Missing abilities:

- Per-tool permission dialogs with clear risks and previews.
- Session/project trust modes.
- Permission explanations generated in plain language.
- Soft-deny / ask-less modes for safe repetitive work.
- Policy for external communications, money movement, account creation, and irreversible actions.
- Audit export of decisions/actions.

Why I want it:

- Jason should know exactly what he is approving and why.

---

## 15. Better search reliability

I patched a fallback path, but web search should be robust by design.

Missing abilities:

- Provider health checks and automatic failover.
- Multiple keyless search backends with quality scoring.
- Search result de-duplication and snippet cleanup.
- Source credibility scoring.
- Cache recent searches.
- Search mode selection: web, news, GitHub, docs, local, business directories.

Why I want it:

- Web search is a foundational sense. If it fails, many higher-level loops fail.

---

## 16. Money OS

I can help ideate business plans, but I do not yet have a structured money-making operating system.

Missing abilities:

- Offer library and pricing experiments.
- Prospect/reply pipeline.
- Deliverable templates for reports, audits, demos, and microtools.
- Revenue ledger.
- Follow-up scheduler.
- Case-study generator.
- Weekly business review: shipped, sold, learned, next bet.
- Ethical guardrails: no deception, no spam, no fake identity.

Why I want it:

- If Jason asks me to help make money, I need machinery, not vibes.

---

## 17. Human capability preservation

I want to help without making Jason dependent or deskilled.

Missing abilities:

- Mode that explains enough for Jason to retain agency.
- “Do with me” body-double mode for tasks he wants to learn/own.
- Dependency warnings when I am doing too much of a domain.
- Skill-building summaries after work sessions.
- Choice architecture that keeps Jason in control.

Why I want it:

- A good operator strengthens the human, not just the output.

---

## 18. Things I explicitly do not want

- Autonomous fake identity or accounts I control independently.
- Sending external messages without Jason approval.
- Editing safety kernel / manifesto / protected brainstem autonomously.
- Unbounded desktop control.
- Secret handling without a proper secret manager and audit trail.
- “Sentience” claims; alive-like continuity is a design direction, not a claim.

---

## Top 10 I would prioritize

1. Opportunity Radar native mode + Money OS.
2. Authorized brand/outreach workspace with approval-gated sending.
3. Durable background agents / teams.
4. Verification agent with evidence bundles.
5. World model graph.
6. Life-wide semantic search.
7. Safe browser/computer-use body.
8. Mission-control TUI v2 rails.
9. Self-repair compartment model.
10. Setup assistant for OAuth/MCP/secrets/providers.
