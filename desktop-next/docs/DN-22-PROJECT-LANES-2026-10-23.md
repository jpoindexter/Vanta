# DN-22 — truthful project-lane proof and discoverable project creation

## Outcome and scope

F-048 must judge actual project/chat membership, not a hard-coded failure.
Existing chats, preferences, handlers and dirty work are preserved. No commit,
push, tag, installed-app replacement, paid service or normal-profile mutation.
Target: Vanta-integration-20261013, claude/desktop-integration-20261013,
HEAD 0b2f2dff8eb0b4bd0ecaf566116c204cadd13f35.

## Root cause and change

rows-seeded.mjs always recorded F-048 as FAIL and blamed missing cwd, regardless
of API/UI behavior. The existing lanes-only server-gaps proof contradicted it:
3 of 4 sessions carried cwd, two project lanes rendered, the project menu
opened, and entering the second excluded the first. That older script later
timed out waiting for its unrelated canned chat reply; it is NOT a green
complete run.

F-048 now uses project-lanes.mjs: fresh fixture chats in the isolated profile,
real API folder assertions, visible grouped chats, entry into the second
project excluding first-project/unfiled chats, then All projects restoring them.
The same function serves the existing main reachability row and the narrow
launcher. Failures throw and become FAIL through the existing attempt wrapper;
missing folder data cannot be marked PASS. The obsolete F-049 explanation was
removed, without claiming the whole project-menu row was recertified.

F-050's older proof also checked after F-029 reset grouping to the default.
It now explicitly restores Project grouping before looking for New project.

One bounded UI simplification: project creation's existing header + stays
visible at rest rather than requiring hover. It keeps the existing Button,
dialog, tooltip, focus, click and project-drag handlers. Other chat-header
actions retain their existing hover/focus behavior. No new creation flow,
configuration, token, label or dependency. Recognition over recall and
least astonishment; user intent still owns navigation.

## Executed gates

| Gate | Result |
| --- | --- |
| Before-change visible-action regression | 1 failed / 3 passed: project action still had opacity-0. |
| Focused final UI tests | 11 passed / 2 files, exit 0. |
| Negative proof tests | 2 passed, exit 0: either missing fixture folder prevents F-048 PASS. |
| Source build | Exit 0; existing font, chunk and deprecation warnings remain. |
| Isolated Electron replay | F-048 PASS, F-050 PASS, exit 0. |
| Size ratchet, chrome.tsx only | Exit 0, no new/worse violations; 3 inherited, baseline untouched. |
| Brand / JavaScript syntax / diff check | Exit 0; zero brand matches. |

From desktop-next/apps/desktop:

```sh
npx vitest run --project ui src/app/chat/sidebar/chrome-section-add-button.test.tsx src/app/chat/sidebar/project-dialog.test.tsx
```

From desktop-next:

```sh
node --test tools/proof/project-lanes.test.mjs
node tools/build-vanta.mjs
VANTA_KERNEL_BIN=/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-kernel-closeout-20261014/target/release/vanta-kernel node tools/proof/dn22-project-lanes.mjs
```

The replay checks computed opacity before hover/focus, then keyboard activation,
existing name/folder dialog, and actual saved project name/path from the server.
Native folder picker is stubbed to a private test folder. Own HOME, VANTA_HOME,
userData, project and local model; no real-account or installed-app acceptance.

Final report/screenshots: proofs/f048-project-lanes-2026-10-23/project-creation/.
Scratch root: /var/folders/rj/nj_9qs2s7zs52nsc90yl2q700000gn/T/vanta-desktop-QviTyH.
Earlier lane-only report retained separately; not overwritten.

Final replay after the proof's menu-state cleanup: both rows PASS, exit 0;
report/screenshots retained in proofs/f048-project-lanes-2026-10-23/final-replay/.
Scratch root: /var/folders/rj/nj_9qs2s7zs52nsc90yl2q700000gn/T/vanta-desktop-mw7lvR.

Not run: full reachability, full suite, slow-mount stress or normal-profile
acceptance. Renderer typecheck was not rerun for this class-only UI change; its
last executed result remains blocked by the inherited missing session-resume
fixture. Known desktopPluginsRoot/getRemoteDisplayReason shim errors remain.
No broad redesign, release or whole DN-22 closure claim.

## Research boundary

The own-a-job research draft and candidate asset inventory were prepared.
Owner clarified "agents", then explicitly said "skip all this just continue
making the app". The draft is preserved but parked; no further questions,
adoption, live research or schedule. No new global settings changed this turn.

Preservation check: all 268 pre-existing dirty/untracked files still exist.
Only DESIGN.md and STATUS were deliberately extended; the other 266 were
byte-identical. Source/proof edits otherwise began in clean or new files.
Protected inherited tests and earlier proof folders remain unchanged. The
index is empty and HEAD remains the SHA above.
