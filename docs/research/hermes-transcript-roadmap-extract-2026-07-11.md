# Hermes Transcript Roadmap Extract - 2026-07-11

Source set:
- `reference/tonbis-ai-garage-transcripts/2026-07-03__Hermes_Agent_Masterclass_-_9._Profiles_Kanban__KPsMThlFb8Y.txt`
- `reference/tonbis-ai-garage-transcripts/2026-06-26__Hermes_Agent_Masterclass_-_8._Subagents_Delegation___6DtQkDpcEs.txt`
- `reference/tonbis-ai-garage-transcripts/2026-06-12__Hermes_Agent_Masterclass_-_6._Tools_MCP_Servers__U140gP-1bEI.txt`
- `reference/tonbis-ai-garage-transcripts/2026-04-22__Hermes_Agent_+_Webhooks_-_How_to_Actually_Build_Automated_Workflows__WNYe5mD4fY8.txt`
- `reference/tonbis-ai-garage-transcripts/2026-06-16__How_I_Put_Hermes_Agent_Inside_Excel_And_Made_It_a_Custom_Function__rodZ1xEuyVU.txt`
- `reference/tonbis-ai-garage-transcripts/2026-07-01__The_Easy_Way_to_Rotate_Scope_Your_Agent_s_API_Keys_Hermes_+_Bitwarden__xLNejNC_7Ic.txt`
- `reference/tonbis-ai-garage-transcripts/2026-07-07__Give_Your_AI_Agent_a_Second_Brain_Gbrain_+_Hermes_Agent__-fSjdYzrFvA.txt`
- `reference/tonbis-ai-garage-transcripts/2026-04-28__Hermes_Agent_Web_Dashboard_Themes_+_Plugins_-_I_Built_My_Own_Plugin__kLDUh20-AJA.txt`

## Extracted Signals

- Persistent profiles matter more than another ephemeral subagent primitive. Hermes treats profiles as durable specialist agents with separate config, model, memory, skills, and reach surface. Vanta has most of the pieces, but not the single operator-facing roster.
- Kanban is used as a routing surface for specialist work. Vanta already has roadmap Kanban, work queues, org chart, and delegation; the gap is a board that routes work to persistent profiles and records evidence.
- Delegation needs a visible receipt tree. The useful pattern is summary-only return to the parent context while raw sidechain transcripts remain searchable.
- Tool surfaces should be role-scoped and explainable. Hermes emphasizes small tool surfaces and recoverable tool failure. Vanta has the enforcement pieces; it needs user-facing "why can this profile use this tool?" copy and repair actions.
- Webhooks turn the agent into an event-driven backend. Vanta shipped webhook triggers, but needs a workflow builder with templates, dry runs, delivery receipts, and on/off controls.
- Spreadsheet control is a real operator surface, not just file parsing. The Excel transcript points at workbook edits, charts, formulas, and custom functions as a future Vanta workflow.
- Secrets should come from a vault with scoped injection and rotation status. Vanta has secret guards and scoped injection; the missing slice is Bitwarden/1Password-style external vault resolution.
- Second-brain ingestion should cover notes, transcripts, and local docs with hybrid search plus source/date receipts. This connects the downloaded transcript corpus to Vanta's brain, vault bridge, and world model.
- Dashboard plugins are useful only if bounded. Vanta can expose plugin panels in Operator Home if every action remains kernel-gated and failed plugins fail closed.

## Roadmap Cards Added

- `HERMES-PROFILE-ROSTER` - next
- `HERMES-KANBAN-ROUTER` - next, after `HERMES-PROFILE-ROSTER`
- `HERMES-SECOND-BRAIN-CORPUS` - next
- `HERMES-DELEGATION-TREE-RECEIPTS` - horizon
- `HERMES-TOOL-SURFACE-PROFILES` - horizon, after `HERMES-PROFILE-ROSTER`
- `HERMES-WEBHOOK-WORKFLOW-BUILDER` - shipped 2026-07-11; real CLI plus signed gateway route/delivery receipt proof
- `HERMES-VAULT-SECRETS-ROTATION` - shipped 2026-07-11; scoped Bitwarden/1Password aliases, startup injection, status, confirmed cutover, and redacted audit proof
- `HERMES-SPREADSHEET-COPILOT` - horizon
- `HERMES-DASHBOARD-PLUGIN-SLOTS` - shipped 2026-07-11; bounded manifest slots, worker updates, gated actions, disable route, and Operator Home readiness
- `HERMES-AUTOMATION-BLUEPRINT-CATALOG` - shipped 2026-07-11; data-only schedule/webhook forms, pure previews, confirmation-gated apply, unified controls, receipts, and Operator Home visibility
- `HERMES-CREDENTIAL-POOLS` - shipped 2026-07-11; redacted reference store, collision-free leases, cooldown/exhaustion, and same-provider rotation before fallback
- `HERMES-PLUGIN-LLM-LANE` - shipped 2026-07-11; grant-gated host model calls with purpose, budget, timeout, structured validation, and redacted cost audit
- `HERMES-DELIVERABLE-AUTO-ATTACH` - shipped 2026-07-11; scoped recent-file planning, path-free chat copy, Telegram-native upload, and content-free delivery receipts

## Build Order

1. Ship `HERMES-PROFILE-ROSTER`.
2. Build `HERMES-KANBAN-ROUTER` on top of the profile roster and existing Kanban/work-queue primitives.
3. Ship `HERMES-SECOND-BRAIN-CORPUS` so future transcript/reference reads become reusable memory instead of one-off analysis.
4. Add the horizon items only when a concrete workflow needs them; most are presentation or integration layers over primitives Vanta already has.

## Guardrail

Do not treat Hermes as a spec to clone. The transcript value is workflow shape: persistent specialist profiles, visible work routing, event triggers, vault-backed secrets, corpus memory, and bounded extensibility. Vanta's differentiator remains local-first operation under the safety kernel with verified receipts.
