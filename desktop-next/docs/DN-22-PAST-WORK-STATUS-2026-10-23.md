# DN-22 — no finished-history label for an executing turn

## Outcome and boundaries

Done for this slice: the actual source app shows a running workflow without a
false Done row for that executing turn in Past work, keeps earlier completed
turns, and the existing Refresh admits the finished chat after its final receipt.
This does not make the workflow itself successful: a paused graph still says
Paused. Chat settlement and workflow completion remain separate facts.

No commit, push, tag, installation, normal-profile state, credentials, live
account, paid inference, worker, Rust or protected factory change.

## Root cause and smallest complete fix

The legacy run projection treated any assistant message as Done, including a
tool request. The library also projected the active checkpoint as past work.
The two new tool-checkpoint cases and cross-client HTTP case reproduced these
failures before editing production code.

- Legacy fallback now requires a non-empty assistant reply with no tool calls.
  An explicit receipt remains authoritative; an unfinished restart checkpoint
  remains Stopped, not Done. No stored status/schema or WorkItem state was added.
- List/get/save resolution excludes the exact active session/turn from all live
  client states in this server. Earlier turns in the same chat remain visible.
  This is read-only filtering, not deletion or rewriting of saved history.
- The existing Outputs refresh previously indexed artifacts only. Its refresh
  revision now also reloads Past work and its workflow section. A focused UI
  regression failed before this wiring. No new refresh button, screen or service.
- Flat rows, quiet shared actions, keyboard behavior and bundled labels remain.
  Applied principles: single authoritative state, least astonishment, recognition
  over recall and less extraneous clutter—not cosmetic relabeling of active work.

## Executed checks

| Check | Result |
| --- | --- |
| Runtime legacy + HTTP API tests | 7 passed / 2 files, exit 0 |
| Desktop library/workflow/reuse tests | 24 passed / 3 files, exit 0 |
| Final source build | Exit 0, 339 runtime chunks; inherited warnings remain |
| Final source Electron replay | 14 checks, exit 0 |
| Runtime TypeScript | npx tsc --noEmit, exit 0 |
| Renderer TypeScript | Exit 2, inherited missing session-resume-active-turn.json fixture only |
| Four changed production files' size ratchet | Exit 0, 7 inherited violations, none new/worse |
| Brand/design/proof syntax/diff checks | Exit 0; zero brand matches |

From vanta-ts:

```sh
npx vitest run src/runs/legacy.test.ts src/desktop/runs-api.test.ts
npx tsc --noEmit
```

From desktop-next/apps/desktop:

```sh
npx vitest run --project ui src/app/artifacts/runs-panel.test.tsx src/app/artifacts/workflow-section.test.tsx src/app/artifacts/reuse-run.test.tsx
npx tsc -p . --noEmit
```

From desktop-next:

```sh
node tools/build-vanta.mjs
VANTA_KERNEL_BIN=/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-kernel-closeout-20261014/target/release/vanta-kernel node tools/proof/dn22-workflow-pause.mjs
node tools/brand/brand-scan.mjs
node tools/design/design-scan.mjs
node --check tools/proof/dn22-workflow-pause.mjs
git diff --check
```

## Actual evidence and limits

Final root:
/var/folders/rj/nj_9qs2s7zs52nsc90yl2q700000gn/T/vanta-desktop-PfTQ3I.
Own HOME/VANTA_HOME/userData/project/kernel port/local scripted model. Existing
workflow proof extended, not replaced. It finishes an earlier chat turn, then
requests compose_workflow from the same chat. While its first action runs, the
API and actual Past work list retain only the earlier completed turn. The live
workflow stays visible as Running, fits 800px, and remains keyboard-operable.
Pause records the request, then reaches the safe checkpoint before action two.
Only after the chat's captured final receipt exists does the existing Refresh
show that reply in history; the graph separately still says Paused.

Report/screenshots: proofs/dn22-done-label-2026-10-23/. The first extended replay
passed the active-history/pause assertions but timed out on a proof-only selector
(`Refresh`, actual accessible name `Refresh artifacts`). Its failure log/root
YA5i5l remain retained; only the selector changed for the final replay. A size
check also caught legacy fallback complexity 11; a small reply-status helper
restored the gate without weakening it. Final build/replay include that helper.

Known unsupported desktopPluginsRoot/getRemoteDisplayReason messages remain.
No full suite/reachability, installed package, native assistive-tech, real model
reasoning, account or background executor across other hosts claim. Retry/cancel
execution and replay/drift are not closed. DN-22 and owner gates remain open.

## Preservation

Pre-edit inventory: 293 dirty/untracked files, none missing; 286 byte-identical.
Seven existing source/proof/docs files were deliberately extended. Backend source
and tests started clean. HEAD remains 0b2f2dff8eb0b4bd0ecaf566116c204cadd13f35;
index empty. The matching Trello comment records this check. Prior proof artifacts
are unchanged; the retained workflow proof source was extended with this case.
