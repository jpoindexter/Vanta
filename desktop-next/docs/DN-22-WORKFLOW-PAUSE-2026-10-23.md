# DN-22 — quiet workflow supervision and actual checkpoint pause

## Scope and Done criterion

Continue V-029 inside Outputs → Past work without another screen. Done for this
bounded source slice: a workflow requested from chat reaches an executing action,
keyboard Pause records a request, the executor stops at its next checkpoint before
the second action, and the row fits a narrow window. Not whole-card acceptance.

No commit, push, tag, package, installation, normal-profile change, credential
access, live account, worker model, Rust or protected factory change.

## Demonstrated defect and changes

WorkflowSection left controls enabled until the server response arrived. The new
delayed-response regression failed first (expected disabled, got false). Controls
now disable immediately with aria-busy during their request; failure restores
them and retains the existing notification. Backend truth is unchanged: only a
confirmed record says Pause requested, only the executor checkpoint says Paused.

Rows now match the existing flat Past work list: no card outline, shared ghost
Buttons, wrapping action cluster, matching heading alignment and wrapping summary
rather than clipping. Actions, API, statuses and accessible names are unchanged.
No new copy/catalog keys. Principles: recognition over recall, reduced extraneous
load, native keyboard semantics, semantic tokens and algorithmic flex-wrap.

## Executed evidence

- Focused UI: 22 passed / 2 files, exit 0. Previous workflow/control/copy and
  adjacent Past work coverage, plus delayed-response lock and failure recovery.
- Source build: exit 0; 339 runtime chunks, inherited warnings remain.
- Source Electron: dn22-workflow-pause.mjs exit 0, 10 checks.
- Size ratchet: workflow-section.tsx passes, 1 inherited violation, none new/worse.
- Brand scan zero matches; design scan, proof syntax and diff check exit 0.
- Renderer types exit 2: only inherited missing
  tests/fixtures/session-resume-active-turn.json import in
  src/app/session/hooks/use-session-actions.test.tsx:112. Not green.

From desktop-next/apps/desktop:

```sh
npx vitest run --project ui src/app/artifacts/workflow-section.test.tsx src/app/artifacts/runs-panel.test.tsx
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

## Actual path and retained evidence

Private root: /var/folders/rj/nj_9qs2s7zs52nsc90yl2q700000gn/T/vanta-desktop-mHEILk.
Own HOME, VANTA_HOME, userData, project, kernel port and scripted local model.
Only this profile has project-scoped compose_workflow/shell_cmd test permissions;
no normal-profile authority was changed or copied. No workflow run was seeded.

The model requested compose_workflow through chat. The first action ran a private
Node fixture, wrote a started marker and waited 20 seconds; the next would write
should-not-run.txt. The proof observed the marker and GET status running, opened
Outputs/Past work, checked borderless layout/800px fit, then pressed Enter on
Pause. Pause requested appeared with disabled controls while GET still said
running. After the first action finished, polling displayed Paused. Final packet:
status paused, revision 3, reason operator pause requested, exactly one wait action
and one attempt. No second-node result or should-not-run.txt exists. Retry is
visible, NOT invoked or certified as resumable execution.

Report and three visually inspected screenshots:
proofs/dn22-workflow-pause-2026-10-23/.

## Remaining gaps / re-entry

- Observed adjacent gap: the Past work chat row says Done while its graph says
  Running. These are separate records; inspect run-summary derivation next before
  treating chat completion as workflow outcome proof.
- Retry/cancel execution and resume/replay are not verified here; a visible Retry
  button does not prove an executor was relaunched.
- Known desktopPluginsRoot/getRemoteDisplayReason unsupported shim errors remain.
- No full suite, full reachability, installed app, owner acceptance, model reasoning
  quality, external account, live worker or native assistive-tech claim.
- DN-22 remains open; account/owner gates and replay/drift deferrals remain.

## Preservation

Pre-edit inventory: 285 dirty/untracked files, none missing; 282 byte-identical.
Only DESIGN.md, CUTOVER-PARITY.md and STATUS were deliberately extended. The
production component/test started clean. HEAD remains
0b2f2dff8eb0b4bd0ecaf566116c204cadd13f35; index empty. No commit/push/tag/install.
