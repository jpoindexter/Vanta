# Home attachment continuity — source checkpoint, 2026-10-27

## Gaps first

This is source integration, not an installed-app update or completed redesign.
The installed app remains archive2/code `2d31393f`. Text still in Home, or an
attachment handoff not yet captured in its fresh draft, lacks process-restart
persistence. Immediate quit in that interval remains open. Full owner visual,
per-item parity, real-account, unfamiliar-person and all-platform gates remain.

## Behavior advanced

Home's existing Attach button now enters a fresh, owner-bound chat draft before
opening the existing file/image picker. It retains the typed words and selected
project, never sends automatically, and does not stage into an older hidden
chat. Cross-project movement uses the existing native confirmation and runtime
reload. Missing project, owner or bridge fails rather than silently targeting
the current project. Empty text and image-only input remain supported.

The pending handoff carries a bounded preparation intent and owner, not new
authority. The mounted fresh composer acknowledges that one-use request.
Ordinary text submission and Quick Entry keep their existing API and behavior.
Files and image bytes reuse existing ingestion/custody, not a parallel subsystem.

Review reproduced and corrected two races: a picker callback rerender could
consume acknowledgement before opening the picker; a late image read could
consult another draft's image budget. Regression tests cover both. Late bytes
cannot write into a new owner's draft; the original occurrence remains
recoverably errored rather than silently unresolved.

Cold-start routing now honors an explicitly remembered fresh chat instead of
falling through to the older stored chat. It does not announce a fresh-to-stored
draft transfer. The resume setting, explicit deep links, peer/HUD exclusions and
existing stored-chat restoration remain. The fix applies to text, image-only,
mixed and empty fresh navigation, not a Home-prefix exception.

## Executed parent evidence

- Integrated on current Desktop Vite 8.3.3: 90 focused UI tests in 10 files,
  nine native-handler tests, renderer and Electron typechecks pass.
- Restart integration: 70 focused tests in four files pass, including the
  existing navigation hook, new fresh-draft cases, helper and owner/window history.
  Private untouched restart source first produced eight failures/three passes.
- Current renderer and main/preload builds pass, sequentially so the renderer
  build cannot erase the freshly built Electron entry.
- Actual canonical-source Electron replay passed 11 checks across real runtime
  project switching, loopback model requests and two quit/relaunch cycles.
  It chose Bravo from Home, traversed native confirmation, verified the native
  root and real kernel root were Bravo, and sent exact words/PNG bytes once.
  Cancellation retained the fresh text without another request or image adoption.
  Text and image-only fresh drafts survived quit/relaunch and renderer reload.
  Explicit image-only send retained the exact PNG hash. Three model requests
  total; both project briefs unchanged; zero renderer errors across lifetimes.
- Native final OS dialogs were fixture-stubbed; application handlers, runtime,
  kernel, storage, renderer and local model transport were real. No normal owner
  profile, live provider account or physical dialog acceptance is inferred.
- Private final same-project replay separately passed five checks, including
  preserving an older chat's unsent text/image. Its frozen dependencies were
  Vite 8.2.0, not a substitute for current-tree or installed-app proof.

The parent replay was tightened after it initially mistook Home's textarea for
the target chat composer. The final run waits for Home to disappear and the
real native picker handler to run before the post-picker restart check. Earlier
failures are retained, not relabeled as successes; the early-close interval
remains a real separate gap, not dismissed as harness-only.

## Scope, modularization and preservation

The reviewed Home cohort contains 27 source/test files; restart uses four more.
New modules pass strict size limits. Existing chat wiring shrinks 1,425→1,424
lines without increasing its function length or complexity; composer actions
shrink 929→924. Home surface loses one finding. The restart hook shrinks
567→566, with reduced restore complexity. Session-actions index is unchanged.
Exact per-metric ratchets—not finding counts alone—show no new/worsened Home
production findings. This is not complete modularization.

Exact source preimages and receipts are retained in private packets
`home-integration-20261027-cT98FM`, `home-attach-20261027-b12dAW`,
`fresh-draft-restart-candidate-20261027-xazvK2` and
`home-cross-project-20261027-wNYbF0`. The final parent replay is
`source-r4-image-only`; `source-r3` is its earlier eight-check text-only run.
All original work must retain its saved hashes. No policy relaxation, protected
Rust/factory edits, legacy capability deletion, main merge or release is included.

Next: durable pre-capture Home text/project handoff, exact new package and
candidate/installed checks with rollback. A running owner app is never replaced.
