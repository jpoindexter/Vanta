# Hermes refresh: finish delivery, then strengthen agent reliability

## Decision

Finish Vanta's signed native update, first-run/help acceptance and normal installer before adopting more upstream features. Then take the small MCP authentication-health defect. Reconnect-tail handling needs a Vanta reproducer before implementation; deeper delegated-work continuity follows later.

This is a bounded research recommendation, not implementation, release acceptance or a second roadmap. [Canonical roadmap](../roadmap.json) IDs/statuses remain authoritative. No cards, source, settings or owner data were changed by this audit.

## Exact source snapshot

| Reference | Verified value |
| --- | --- |
| Hermes `main` | [`27e389359263b7294e2788fee048953fc34b82d1`](https://github.com/NousResearch/hermes-agent/commit/27e389359263b7294e2788fee048953fc34b82d1), commit timestamp 2026-11-17 13:10:19 UTC |
| Latest stable | [`v0.23.2`](https://github.com/NousResearch/hermes-agent/releases/tag/v0.23.2), published 2026-11-16 20:59:18 UTC; commit `ae2a81ccc00e9b7c06301523e5bb09608397149c` |
| Newest canary | [`v0.23.2+canary.20261117T064624Z`](https://github.com/NousResearch/hermes-agent/releases/tag/v0.23.2%2Bcanary.20261117T064624Z), published 2026-11-17 07:54:16 UTC |
| Installer-review baseline | `7abd4a227e6eacbf34977e3ed4c56bea895ce1cc`; [prior audit](desktop-installer-hermes-audit-2026-11-17.md) covered the installer, not the whole agent/Desktop |
| Exact delta | [Baseline → pinned main](https://github.com/NousResearch/hermes-agent/compare/7abd4a227e6eacbf34977e3ed4c56bea895ce1cc...27e389359263b7294e2788fee048953fc34b82d1): 160 commits ahead, zero behind; 83 net changed paths: 71 `plugin-catalog/*`, 12 `contributors/*` |

There are **no net core-agent/Desktop file changes in that comparison**. This is not “zero new commits,” nor proof that the current core was comprehensively reviewed. The earlier [October core comparison](upstream-agent-desktop-adoption-2026-10-01.md) used `040b6df2c40b0f4f88f51e4c2062eafc4d7463c5`; the current audit samples newer reliability patterns rather than certifying that whole interval.

## Five bounded adoption decisions

### 1. P0 — finish the existing signed-update delivery gate

**Existing owner:** `DESKTOP-SIGNED-AUTO-UPDATE` (recorded as parked at inspection; current implementation/release work does not itself change that status).

**Hermes observation:** [Backup configuration](https://github.com/NousResearch/hermes-agent/blob/27e389359263b7294e2788fee048953fc34b82d1/apps/desktop/electron/pre-update-backup-config.ts) defaults to retaining recovery when a configuration probe fails. [Update ordering](https://github.com/NousResearch/hermes-agent/blob/27e389359263b7294e2788fee048953fc34b82d1/apps/desktop/electron/update-order.ts) settles other owned connection transactions before local shutdown.

**Vanta disposition:** Already substantially covered by the current [preparation transaction](../desktop-next/apps/desktop/electron/vanta/update-preparation.ts), native runtime/custody leases and [rollback helper](../desktop-next/apps/desktop/electron/vanta/update-rollback.ts). Reuse the failure cases and ownership principle, not Hermes's updater/fleet architecture. Do not make Vanta's retained rollback optional.

**Executable Done:** Use two real signed/notarized packages. Approve the intended version once; demonstrate busy/unknown work refusal; verify archive and publisher; retain a matching rollback; complete native replacement/relaunch; read back the exact target version/source and preserved draft/attachment. Record failed/offline/corrupt artifact recovery without automatic effect replay. During native handoff, observe bundle version/process/install metadata without a launch-capable UI observer; attach UI only after installation is established. Publication or an `update-downloaded` event alone is not completion.

### 2. P1 — first useful chat and actionable help, not another wizard

**Existing owners:** `UX-04`, shipped `VANTA-PROJECT-ONBOARDING`, and `DESKTOP-PRIVATE-FEEDBACK`. Keep this as a narrow acceptance slice of the current delivery work.

**Hermes observation:** [Onboarding run ownership](https://github.com/NousResearch/hermes-agent/blob/27e389359263b7294e2788fee048953fc34b82d1/apps/desktop/src/store/onboarding-run.ts) distinguishes run state and the window showing it. [Doctor findings](https://github.com/NousResearch/hermes-agent/blob/27e389359263b7294e2788fee048953fc34b82d1/hermes_cli/doctor_report.py) separate fixable issues from manual issues. [Fallback readiness](https://github.com/NousResearch/hermes-agent/blob/27e389359263b7294e2788fee048953fc34b82d1/hermes_cli/fallback_check.py) distinguishes static configuration/auth checks from explicit live inference, disables SDK retries for a live probe, and avoids silently testing another provider.

**Vanta disposition:** Help already exposes Docs and feedback in [the app menu](../desktop-next/apps/desktop/electron/vanta/app-menu.ts). Missing credentials already route back to [provider setup](../desktop-next/apps/desktop/src/app/session/hooks/use-prompt-actions/session-creation-error.ts), and [CLI doctor](../vanta-ts/src/cli/doctor-cmd.ts) exists. Reuse those surfaces and [Desktop help](desktop-help.md). Add an actionable diagnosis only where the real acceptance path exposes one; do not rebuild onboarding or copy mandatory boot overlays.

**Executable Done:** A fresh isolated profile keeps typed text while identifying a missing provider/model, reaches the intended provider's first useful reply, and reopens Help by keyboard. Help explains the actual recovery action and offers a reviewed, redacted report. A static check makes no inference/tool request; an explicitly approved live probe makes one bounded request on the selected route, reports uncertainty truthfully, and never sends the user's original task automatically.

### 3. P1/P2 — a small MCP authentication-health correction

**Existing owner:** `MCP-FLEET-HEALTH-CONTEXT-BUDGET` (parked). `VANTA-MCP-FIRST-CLASS-CONNECTORS` and `DESKTOP-MCP-CONTROL-CENTER` are already shipped; do not add duplicate connector cards or activate the whole fleet/context-budget scope.

**Hermes observation:** [MCP discovery](https://github.com/NousResearch/hermes-agent/blob/27e389359263b7294e2788fee048953fc34b82d1/hermes_cli/mcp_startup.py) scopes startup discovery per profile and treats lazy registration differently from failed discovery. Its bounded discovery and auth handling are useful references, not a drop-in security contract.

**Vanta gap, source-confirmed:** [Connector auth](../vanta-ts/src/mcp/registry.ts) treats any stored `access_token` as ready; the [stored token schema](../vanta-ts/src/mcp/auth-store.ts) already carries `expiry_date`, but the registry does not use it. This can misrepresent known-expired authentication before a task calls the connector.

**Smallest adoption / Done:** Add an expired-token registry fixture, then make known-expired auth visibly require refresh/reauthorization rather than unqualified readiness. Desktop and CLI must report the same state, preserve project/profile scope, and provide an explicit recovery action without executing a tool or launching interactive OAuth in the background. Preserve Vanta's explicit-empty allowlist as denial; do not adopt Hermes's empty-filter-to-all behavior wholesale.

### 4. P2 — reproduce adopted-reply tail duplication before modifying streaming

**Existing owners:** `SESSION-RESUME-PERSISTENCE-IDEMPOTENCE` and the existing Desktop continuity contract; no new chat-shell project.

**Hermes observation:** [`e87a591d9b973fa912ef227a7764edb341b978ac`](https://github.com/NousResearch/hermes-agent/commit/e87a591d9b973fa912ef227a7764edb341b978ac) carries raw segment offsets through queued deltas and adopted stored replies. Its tests cover a lost chunk, a later chunk already present in storage, and raw attachment tags rendered as cards, without relying on a completion event to repair duplication.

**Vanta disposition:** The [live-resume bridge](../desktop-next/apps/desktop/src/api/vanta/live-resume.ts) already validates original-turn identity and repairs a missed terminal frame without another chat POST. The inspected [message parts](../desktop-next/apps/desktop/src/lib/chat-messages/parts.ts) retain `mediaSource`, but do not contain the reviewed stored-tail/offset treatment. This is a candidate gap, not an executed Vanta failure; the bridge may need a different equivalent contract.

**Executable Done:** Replay a Vanta-native stream with one dropped chunk, adoption of a longer stored reply, delayed covered deltas, a raw attachment tag, and a missing completion. Assert one complete assistant reply, one attachment, no second chat POST, no foreign-session overwrite and no false Done. Change production only if the current path fails that reproducer.

### 5. P2 later — make unfinished delegated work inspectable across restart

**Existing owners:** `DELEGATION-LIVE-STEERING-BUDGET` (parked) and shipped `HERMES-DELEGATION-TREE-RECEIPTS`. Keep named routing and additional fan-out out of this narrow continuity slice.

**Hermes observation:** [Stored child lookup](https://github.com/NousResearch/hermes-agent/blob/27e389359263b7294e2788fee048953fc34b82d1/tools/delegate_tool_sessions.py) verifies parent/delegate/compression lineage before exposing a child's transcript; a short child ID alone is not authority. [Descendant lookup](https://github.com/NousResearch/hermes-agent/blob/27e389359263b7294e2788fee048953fc34b82d1/hermes_state_delegate_children.py) stops ownership traversal at branch/delegate boundaries.

**Vanta disposition:** [Background delivery](../vanta-ts/src/subagent/async-delegate.ts) already persists custody/result claims and retains review holds. [Delegation](../vanta-ts/src/tools/delegate.ts) runs the worker as a process-local promise and records the full delegation node on settlement. The smallest useful extension is an inspectable, parent-owned child/session cursor persisted at start—not automatic resubmission after a crash or a replacement worker framework.

**Executable Done:** Interrupt one bounded read-only research worker, restart the supported host, and inspect its exact owned partial transcript/artifacts. Reject unrelated child IDs and foreign branches. Explicit continuation must use current policy/budget; uncertain external effects remain held and are never replayed automatically. A durable result receipt alone does not prove resumable execution.

## Coverage and non-adoption boundary

Executed research: exact GitHub main/release/compare metadata, the 83-path net delta inventory, 30 recent commit subjects, latest stable/current canary notes, the recursive path index, selected pinned core modules, and corresponding current Vanta source/cards. Upstream release smoke claims were not independently rerun.

Not established: a line-by-line audit of all 160 commits, the full October-to-November core delta, all Hermes releases/docs/plugins, runtime security or whole-product parity. No upstream application, plugin or new tool was installed; no source/assets were vendored into Vanta. Catalog metadata is not sufficient evidence to approve a plugin.

No new WIP is proposed. Preserve the current delivery goal and existing card IDs/history. Re-enter later candidates with one failing bounded proof; do not turn the comparison into another shell rewrite, hosted-service dependency, unapproved live probe, credential/approval migration or business-action replay.
