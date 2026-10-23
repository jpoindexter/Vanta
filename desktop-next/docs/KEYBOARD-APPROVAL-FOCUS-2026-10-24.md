# Keyboard navigation and approval focus — 2026-10-24

## Executed outcome and boundary

Done for this slice means actual source Electron can reach the pending approval
by keyboard, traverse its decisions both ways, reject/allow once, and return
focus to the preceding connected control without granting extra authority.
The exact-index candidate passes 40 assertions, with zero renderer errors.
This is source/private-profile proof, not installed-app or full keyboard/AT
acceptance. DN-13, DN-22 and DN-29 remain open.

## Observed causes and smallest corrections

1. The approval remembered focus only on pointerdown. Real Shift+Tab → Reject
   → Enter left focus on body; two new keyboard variants failed in the existing
   regression. The same origin ref now captures keyboard entry via relatedTarget.
   Existing connected-origin and moved-on guards remain; arrival never autofocuses.
2. The floating composer intercepted programmatic focus on ordinary controls.
   The first source replay caught restoration being redirected into the composer
   despite green component tests. A focus trace identified the exact interceptor.
   It now uses the existing activation-target predicate to respect control focus.
   Composer-editor ownership and pointer-follow rules remain unchanged; adjacent
   selection, text-field and floating-layer tests still pass.
3. The composer's blanket outline suppression hid keyboard rings on its buttons.
   Reused only the six-line token-based ring rule already present in unfinished
   vanta-composer.css work. No replacement rule, new token or broad style rewrite.
   All other design hunks remain unstaged. The review glyph now uses the existing
   translated Review label; no new locale strings or extra control.

No approval persistence, fresh-approval, execution, keyboard shortcut, gateway,
Rust or factory policy was changed. Navigation does not approve. One allow-once
edit executes; Reject/Escape do not edit or create a saved Always rule.

## Narrow proof ledger

| Executed check | Observed result |
| --- | --- |
| Existing approval component regression extended to keyboard | Two keyboard cases failed before fix; pointer case passed |
| Floating focus interceptor regression | Failed before correction, then passed |
| Focused UI tests / 8 files | 59 passed |
| Exact-index source build | Exit 0; 339 runtime chunks |
| Actual keyboard replay | 40 assertions, six local model requests, zero renderer errors |
| Tab/Shift+Tab | Six traversed composer buttons named/ringed; all three decisions reached both ways; inline card can be exited |
| Enter Reject / Space Allow once | Exact prior control restored after both decisions; rejected file unchanged, allowed edit written |
| Escape from empty composer | Waiting approval rejected, no second edit, composer retains focus |
| Renderer TypeScript | Only inherited missing session-resume-active-turn.json fixture; not green |
| Size / architecture | Nine inherited violations, none new/worse; five boundaries pass |
| Brand / design | Zero matches / no new-worse counts |

Run from desktop-next:

```sh
node tools/build-vanta.mjs
node tools/proof/keyboard-approval.mjs
```

The proof reuses done-path's makeSandbox/launchApp and scripted model. It sets
default permission/operating mode explicitly through that existing harness;
generic launchVanta's defaults completed ordinary edits without asking and were
not an approval reproduction. No owner settings were changed to force the gate.
No DOM focus/click shortcuts are used to reach/activate approval controls.

Candidate: /Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/keyboard-candidate-20261024-Gyo8UN.
Final root: /private/var/folders/rj/nj_9qs2s7zs52nsc90yl2q700000gn/T/vanta-donepath-AhadVQ.
Baseline root: /private/var/folders/rj/nj_9qs2s7zs52nsc90yl2q700000gn/T/vanta-donepath-zYDuEs.
Competing-focus trace: vanta-donepath-kySgji/focus-failure.json under that same
private temporary parent. Logs: /tmp/vanta-keyboard-*.log. Final report and
screenshots are in proofs/keyboard-approval-2026-10-24/.

## Preservation and remaining scope

Pre-edit source backup: /Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/keyboard-20261024-2SyfRw/.
Complete verified branch bundle, binary dirty patch and untracked archive; no
backup retention deletion. Post-commit source backup also retains the remaining
dirty files. All 273 pre-existing changed/untracked file bytes remain identical;
the existing ring hunk is staged separately without changing its working file.
Normal profile, accounts, app installation and unfinished design are untouched.

Not checked: full shell/menus/split panes, screen-reader announcements, contrast,
zoom, reduced-motion, native TCC, live accounts, packaged/installed app, whole
suite or CI. The timeline tick's outline-only probe was false; its alternative
focus styling was not audited here, so this is not a whole-shell focus claim.
The inherited fixture error and default-branch dependency alerts remain open.
No main merge, PR edit, tag, release, installation or broad Done movement.
