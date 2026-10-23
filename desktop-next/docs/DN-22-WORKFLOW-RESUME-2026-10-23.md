# DN-22 — Resume executes the remaining workflow

## Executed outcome

The actual source Electron app starts a workflow from chat, pauses after its
first action, and resumes through the existing workflow row. The first effect
remains at one execution; the second executes exactly once. The persisted graph
ends `done` / `succeeded`, the UI shows Done and no longer offers Resume. No new
model request reconstructs the graph. This is source-app evidence, not installed
app acceptance or proof of every workflow/node/provider combination.

No commit, push, tag, installation, normal-profile state, credentials, live
account, paid inference, external worker, Rust or protected factory change.

## Root cause and bounded change

The Retry route only changed the stored status to running. It did not start an
executor. The HTTP regression reproduced this before the implementation change.

- New graph checkpoints carry a canonical source hash. Resume finds matching
  source in existing project workflow revisions or same-project chat tool calls.
  It never asks a model to guess/rebuild the graph or stores another source copy.
  A changed graph at the same ID/revision also fails the executor's pin check.
- The desktop route dispatches `compose_workflow` through the standard policy,
  approval, hooks and effect gateway with a fresh call identity. Its atomic
  control claim prevents duplicate accepted starts. A 202 means admitted/running,
  not successful. Existing polling reports the actual final checkpoint.
- Only paused terminal checkpoints can resume here. Missing/older unpinned source
  leaves the checkpoint unchanged with an actionable error. Denial does not
  consume the checkpoint. Error/exhausted/cancelled outcomes do not advertise an
  automatic retry; uncertain effects require inspection, never blind replay.
- The existing foreground client routing and approval timeout are reused, so
  approvals have the active chat stream. No connected approval channel fails
  closed when approval is required. Project permission policies are unchanged.
- UI wording is Resume, reusing an existing translation in all bundled locales.
  Shared ghost Buttons, flat rows, wrapping and keyboard operation are retained.
  Principles: visible system status, truthful action naming and reduced clutter.

No new service, dependency, global runner, permission policy or replay mode.
Original budgets and confirmed node results remain in the same run.

## Checks executed

| Check | Result |
| --- | --- |
| Runtime resume/API/execution/store/replay tests | 20 passed / 5 files |
| Renderer control routing/workflow/history tests | 25 passed / 3 files |
| Runtime TypeScript | Exit 0 after correcting a new test's non-null annotation |
| Renderer TypeScript | Exit 2: inherited missing session-resume-active-turn.json fixture |
| Source build | Exit 0; 339 runtime chunks |
| Actual source Electron replay | 19 checks, exit 0 |
| Nine production files' size ratchet | Exit 0; one inherited violation, none new/worse |
| Brand scan / design baseline comparison | Exit 0; zero brand matches, no new/worse design counts |
| Proof syntax and git diff --check | Exit 0 |

From `vanta-ts`:

```sh
npx vitest run src/desktop/workflow-resume.test.ts src/desktop/workflow-run-api.test.ts src/workflow/execute-state.test.ts src/workflow/run-state-store.test.ts src/workflow/replay.test.ts
npx tsc --noEmit
```

From `desktop-next/apps/desktop`:

```sh
npx vitest run --project ui src/api/workflow-runs.test.ts src/app/artifacts/workflow-section.test.tsx src/app/artifacts/runs-panel.test.tsx
npx tsc -p . --noEmit
```

From `desktop-next`:

```sh
node tools/build-vanta.mjs
VANTA_KERNEL_BIN=/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-kernel-closeout-20261014/target/release/vanta-kernel node tools/proof/dn22-workflow-pause.mjs
node tools/brand/brand-scan.mjs
node --check tools/proof/dn22-workflow-pause.mjs
git diff --check
```

The design comparison imports `scan()` from tools/design/design-scan.mjs and
compares counts against the existing baseline without rewriting it.

## Real-path evidence

Root retained:
/var/folders/rj/nj_9qs2s7zs52nsc90yl2q700000gn/T/vanta-desktop-teOOs7.
Own HOME/VANTA_HOME/userData/project/kernel port and local scripted model. The
existing Pause proof is extended, not replaced. It records 19 assertions and
three model requests, all before Resume. A first-action append marker contains
exactly one line; its node has one attempt. The second file contains exactly
`Resumed at the checkpoint`; its node also has one attempt. Final state is
`done`, terminal `succeeded`, controls empty. Earlier completed history remains.

Report and four screenshots:
`proofs/dn22-workflow-resume-2026-10-23/`. The report keeps its original filename
`dn22-workflow-pause.json` and adds the final `resumed` packet. Previous dated
proof folders remain untouched. No full-suite or repeated proof marathon.

Known unsupported desktopPluginsRoot/getRemoteDisplayReason messages remain.
No installed-package, normal-profile approval UI, process-crash recovery,
cross-host executor, live cancellation, native assistive-tech or real account
acceptance claim. Older unpinned checkpoints must start new work rather than
resume guessed source. DN-22 and the owner-gated items remain open.

## Preservation and re-entry

The pre-edit inventory contains 303 dirty/untracked files: none missing,
297 byte-identical, six deliberately extended (workflow UI/test, existing proof,
DESIGN, STATUS and parity). Other new changes began clean or are new files.
HEAD remains 0b2f2dff8eb0b4bd0ecaf566116c204cadd13f35 and the index is empty.

Next: check actual Cancel checkpoint behavior using this same isolated workflow
proof, then continue dependency-ready DN-22 gaps. Do not reopen parked research,
live accounts, DN-21/DN-25 proof marathons or owner-gated DN-28/30/32/33.
