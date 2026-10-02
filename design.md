# Vanta Desktop — ambient agent workspace

## Current contract — October 2

The owner requires the **whole workflow**, not just New chat or a reskin. Use
[the ambient workflow contract](docs/desktop-ambient-workflow-2026-10-02.md):
invoke, give context, work, intervene, inspect results, leave/resume, and schedule.
The mini and optional avatar are entrances to the same live workspace, not a
second agent or conversation store. No interview/demo edition is selected.

Current branch: `codex/desktop-chat-workbench-20261002`. Authority includes
implementation, local guarded app replacement, documentation, and normal Git
publication. Required review still applies before any merge. No force push,
paid workflows, release, deployment, notarization, or unsolicited account action.
Preserve credentials, drafts, other checkouts and a recoverable prior app.

This section supersedes the historical September execution scope below.

## Locked direction

Modern-minimal application, not a marketing page. Familiar conversation sidebar,
readable transcript, quiet composer, optional contextual inspector. Vanta's engine,
providers, approval policy and canonical stores remain the source of truth.
The approved reference is the interaction structure of Codex Desktop, not its
branding or proprietary renderer. The October 2 owner direction now permits
adapting LibreChat's actual frontend. Its identified presentation components
retain upstream attribution/license and connect to Vanta's existing runtime;
no second engine or history store is introduced. See
[the adoption record](docs/librechat-desktop-adoption-2026-10-02.md).

## System

Use `vanta-ts/desktop-app/src/design/tokens.css`: white `#ffffff`, light grey
`#f7f7f8`, dark text `#202024`, and Vanta violet with accessible text/focus tokens.
Light is the new-profile default. Preserve a saved dark preference; the visible
appearance control lets the owner change it. Native splash, dialogs and body
share the appearance mapping instead of leaving a dark frame around light content.
System UI face for controls and conversation; existing system mono for code.
Keep an optional dark-theme mapping. Four-point spacing, 40px controls, 44px touch
targets, restrained 6–16px radii. No decorative gradients, stock imagery,
fake window chrome, marketing hero, or rotating themes.

Layout styles are scoped to `.chat-first-shell`; semantic appearance tokens are shared.
The sidebar is secondary, conversation primary, inspector tertiary. New chat
does not require a task form. Project/task creation remains a separate action.
The conversation list takes priority over feature navigation. Today, Outputs,
Library, Schedules, Skills & tools and advanced project creation remain behind
the initially collapsed Tools & activity disclosure. Chats, Activity and
Connections have labelled navigation-rail shortcuts; chat history can collapse
without removing those entrances. Utility screens have a Back to chat action
that returns to the current session without creating another one. New-chat
starters prepare editable drafts only, never submit or overwrite a draft.
Hover previews also appear on keyboard focus; touch keeps actions visible.
Use semantic controls, immediate focus rings, Escape and focus restoration.
Motion is optional opacity only; reduced motion removes it. Quiet success,
persistent actionable errors; never fabricate readiness, evidence or counts.

## Historical September execution ledger

- Outcome: a usable chat-first desktop candidate with an explicit Classic fallback.
- Target: isolated `codex/desktop-replacement-20260908`, baseline
  `ab5e8910f2d474ed3e84772bf2262893b9962b5e`.
- Now: locally executed primary-shell candidate, with retained packaged evidence.
- Next: review the candidate, then migrate the remaining Classic-only surfaces.
- Later: unfamiliar-person beta proof and a separately authorized installed-app cutover.
- Must: preserve sessions, drafts, policies, integration routes and installed app.
- Must not: change protected source, operator state, paid Actions, publish or release.
- Authority: local renderer implementation and isolated tests; no Git publication.
- Done evidence: exact local candidate chat/send/stream/stop/switch/reopen replay;
  queue/model/keyboard/responsive checks; typechecks, regressions and secret scan.
- Re-entry: read the rebuild audit, inspect the uncommitted diff, and start with
  the never-sent draft recovery edge case. No roadmap promotion from a component test.

## Capability boundary

Chat-first uses existing session, chat, approval, model, attachment, queue,
continuity, output, schedule, connection and plugin APIs. Classic retains the
complete existing workbench, including workflow replay and detailed inspectors.
No second agent, session database or credential store is introduced.

## Historical September verification status

The packaged macOS ARM64 candidate executed 17 local interaction scenarios:
New chat, send/stream/stop, visible queue editing/removal/exactly-once drain,
saved-chat/draft switching and restart, compact model controls, keyboard focus,
sidebar preview/rename/pin/search/archive/restore, contextual panels, preserved
workspace routes, light settings, project-task draft creation, and Classic access.

The real application runtime, kernel and stores were exercised against a
synthetic local provider. This is not live-provider, account, human-beta or
distribution proof. See [the executed rebuild audit](docs/desktop-chat-first-rebuild-audit-2026-09-08.md).

The separate reconciled roadmap worktree is preserved; this branch's older
roadmap must not overwrite it. No card was promoted, and no commit, push, tag,
release or installed-app replacement was performed.

## Design review

<!-- Hallmark · pre-emit critique: P4 H4 E4 S4 R4 V3 -->

The hierarchy, Vanta palette, compact control states and real packaged screenshots
were reviewed. Axe found no serious/critical issues on the exercised conversation,
context, settings and 760/1024/1440px layouts. The send arrow uses the bone-on-violet
token; hover preview delays 800ms while keyboard focus is immediate. Reduced
motion removes animation. Native chrome is not redrawn.

The approved application genre keeps system fonts and a familiar, consistent
workbench structure; marketing-hero and cross-project visual-variety rules do not
apply. Native Desktop has a 760px minimum width. A phone layout, complete 58-gate
certification, VoiceOver replay and unfamiliar-person comprehension are not claimed.

## Historical September 30 continuation

The owner's renewed direction is a general-purpose personal agent behind a
familiar conversation interface, not a coding-only product or task dashboard.
This pass keeps Vanta's black/bone/violet system and existing runtime. It applies
progressive disclosure, a sidebar-plus-conversation shell and explicit keyboard
ownership. See `docs/desktop-conversation-first-2026-09-30.md` for this pass's
fresh evidence and installation boundary; earlier receipts remain historical.
