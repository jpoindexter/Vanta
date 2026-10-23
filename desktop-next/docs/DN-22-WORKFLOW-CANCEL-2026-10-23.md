# DN-22 — cancellation at the next checkpoint

## Scope and authority

Done criterion: in the actual source Electron app, request Cancel while a
chat-started workflow action is executing; show Cancel requested, let that action
finish once, then persist Cancelled before the next action. Never call that
workflow Done or offer automatic Resume.

The owner authorized regular commits/pushes and backups in this turn. This
supersedes the earlier no-Git instruction for scoped, verified publication, not
for force-push, default-branch merge, PR #66 edits, release, installation, owner
account actions or sweeping unrelated dirty work into a checkpoint.

## Observed behavior and smallest fix

Cancellation already reached the real executor's checkpoint. The initial
source run passed 16 checks: the first shell action finished successfully once,
the second file action never ran, and the row became Cancelled with no Resume.
No speculative executor rewrite was needed.

The real receipt nevertheless told the agent to retry. A new narrow assertion
failed against that wording. The one-line correction now says: “Review completed
steps before starting a new workflow.” Pause semantics are unchanged. The
existing safe-control projection offers Resume only for paused checkpoints.

The existing proof gains `--cancel`; its default retains Pause → Resume. Both
use private HOME/VANTA_HOME/userData/project/kernel ports and a local scripted
model. No normal-profile or live-account work. Same shared ghost Buttons, flat
rows, keyboard activation and request-vs-terminal status; no extra dialog or
technical supervision screen. Named principles: single source of truth,
visible system status, precise action feedback and progressive disclosure.

## Publication checks

Only the workflow controls and required Past work/history callers, translations,
tests and evidence are selected for publication. The unfinished navigation,
styling and four handoff-protected files remain outside the index. No deletes.
The selected index is exported to an isolated candidate directory before
publication, so checks do not rely silently on other dirty working-tree edits.

Candidate directory:
`/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/cancel-candidate-20261023-ltyMKh`.
Dependency installations are reused through symlinks; compiled output belongs
to the candidate. No dependencies were downloaded or updated.

- Candidate runtime: 28 focused tests / 7 files passed.
- Candidate renderer: 27 focused tests / 4 files passed.
- Actual candidate Cancel: 17 checks passed, source root tCezuw, final terminal
  cancelled, first action ok/one attempt, second file absent. Report and three
  screenshots: `proofs/dn22-workflow-cancel-2026-10-23/`.
- Candidate Pause → Resume: 19 checks passed, root Mrcd7C, first/second effects
  once each, final succeeded. `resume-index.json` and `04-resumed-index.png` are
  retained alongside the Cancel proof. These are exact-index proofs, not claims
  about the unrelated dirty desktop surfaces omitted from publication.
- Candidate source build and runtime TypeScript passed.
- Renderer TypeScript still fails only on the inherited missing
  `tests/fixtures/session-resume-active-turn.json` fixture.
- Staged size ratchet: 17 production files, nine inherited violations, no
  new/worse violations. Existing baseline is unchanged.
- Five architectural boundaries pass. Candidate brand scan has zero matches;
  design counts have no new/worse entries against the unchanged baseline.
- Gitleaks scanned the 13 already-committed local-only commits and staged text:
  no findings. GitHub Actions permissions were read as disabled; no enabling.
- Proof syntax and staged diff whitespace checks pass.

Initial index replay failed before any model call: the isolated copy lacked the
ignored `target/debug` kernel dependency. Full logs/screenshots were read.
Forwarding VANTA_KERNEL_BIN in proof extraEnv did not help: the Electron launcher
sets its own resolved kernel path. That ineffective proof edit was reverted.
The candidate instead links the same existing kernel dependency as the source
worktree (SHA-256 371a0c86af76041ab2a6d5fcbfcb722b756ba12e65a51a3657f271d6c5a5b471).
No Rust, production startup or safety policy changed. XYRHyw/e1SZEh and the
`/tmp/vanta-cancel-index-proof*.log` failure evidence remain retained. These runs
do not establish behavior with another kernel build or the installed package.

## Run commands

From `desktop-next`:

```sh
node tools/build-vanta.mjs
node tools/proof/dn22-workflow-pause.mjs --cancel
```

The source launcher requires its resolved `target/debug/vanta-kernel` dependency;
an outer VANTA_KERNEL_BIN does not select this source-Electron launcher's binary.
Omit `--cancel` for the existing Pause → Resume contract. The no-automatic-retry
rule applies to side effects; cancellation is cooperative at a checkpoint, not
a promise to interrupt or undo the current external action.

## Backup and remaining limits

Verified pre-edit backup:
`/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/cancel-20261023-V7ae5z/`.
It contains a complete verified branch bundle, binary tracked patch, all 252
untracked file entries and SHA-256 values recorded in the task output. It stays
outside the public repo. No backup retention/deletion script was run.

The pre-edit hash inventory covers 321 existing dirty/untracked files. Preserve
every file even when a subset is committed: none missing, 315 byte-identical;
six UI/test/proof/docs files deliberately extended before the final error note.
No normal profile, credentials,
native/assistive-tech, installed package, process-crash, cross-host or parallel
node cancellation acceptance is claimed. Known unsupported shim messages and
the missing renderer test fixture remain. Whole DN-22 is still open.

Re-entry: continue dependency-ready engineering gaps, one actual user path at a
time; owner-gated items, parked research and proof marathons stay parked.
