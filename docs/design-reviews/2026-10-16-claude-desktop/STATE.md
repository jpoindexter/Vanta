# Vanta desktop redesign — working state

Outcome: an evidence-backed full redesign plan and a browser-tested, interactive HTML prototype.

Target: installed Claude Desktop and Vanta; Vanta source, strategy, roadmap, and product acceptance.

Must: preserve existing capabilities and user data; distinguish observed, inferred, documented, proposed, and unknown; plan the full product; keep prototype artifacts separate.

Must not: change Vanta application code, roadmap, kernel, runtime state, credentials, or installed applications; send messages or files; invoke paid model work.

Authority: user approved REA-first inspection on 2026-10-16; Ghidra is available only if deeper native analysis is needed and announced first.

Done evidence: feature-by-feature preservation map; reference evidence with limitations; full architecture and migration proposal; interactive prototype with browser interaction results; record source concurrency and do not edit application code; locally checkpoint current integration work as authorized.

Now: plan, 296-ID preservation audit, and 52 browser sample checks recorded. Create the authorized local integration checkpoint and report native gaps.

Next: native application implementation only after owner review of the full plan.

User corrections: closely follow Claude's layout and design; include an explicit Chat / Code switch in the same application. Preserve separate drafts, selected sessions, and pane arrangements on round trips. Mode is presentation/work context, never new authority. User also authorized committing all current Vanta integration work after completion. This supersedes the earlier no-commit boundary, not the no-application-code-edit boundary.

Repository concurrency: Claude Desktop visibly has a Vanta coding session. Do not interrupt or message that session. Before committing, refresh the integration worktree and include a bounded snapshot; leave concurrently arriving edits intact and report any remainder.

Later: Vanta implementation only after the user reviews the plan.

Re-entry: read this file, REDESIGN-PLAN.md if present, then evidence/ and prototype/; refresh app hashes and source status before further inspection.

Initial source snapshot: canonical checkout recorded by prior work is `docs/Vanta-librechat-shell-adapter-20261002`, HEAD `92ee5c8643b188eda4349f89fac40533c681d252`. Its pre-existing worktree status is ` D vanta-ts/package.json` and `?? handoffs/`; preserve both. The installed app was modified later than this source snapshot, so reconcile packaged contents rather than assuming parity.

REA note: Claude ASAR inventory reports eight integrity contradictions involving unpacked companions. They are retained as observed-untrusted with record-and-continue; this is not a security clearance or evidence of malicious modification.

Revision acceptance: user rejected v1's approximate styling and limited feature surface. Deliver a faithful Claude layout clone with Vanta's existing capabilities, not every Claude-only capability. Keep an explicit Chat / Code switch. The account footer must be Profiles with create/switch/clone/import/export, with no app login or logout. Provider/connector auth remains separate. Reference AX confirms Claude sidebar width is 288 CSS px. V1 is preserved under evidence/prototype-v1/.
