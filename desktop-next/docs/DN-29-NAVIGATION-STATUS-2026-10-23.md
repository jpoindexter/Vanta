# DN-29 navigation and status — 2026-10-23

Owner requested a less technical, Codex-like navigation and bottom status bar,
preserving all work and prohibiting commit/push. Source checkout:
`Vanta-integration-20261013`, branch `claude/desktop-integration-20261013`,
HEAD `0b2f2dff8eb0b4bd0ecaf566116c204cadd13f35`.

## Now

- Chat-first navigation keeps New chat, Home, Outputs and contributed entries
  directly visible. Schedules, Connections, Skills & tools and Company sit under
  **Tools & connections**, one disclosure, preserving their row handlers,
  route IDs, shortcuts and context menus. An active supporting route opens the
  group; the user can still collapse it. No persisted navigation preference is
  overwritten. Compact rail destinations stay directly available.
- The bottom strip keeps connection/project/profile state and active work,
  failures, updates and an existing Off approval-mode warning in view. Routine
  diagnostics and duplicate shortcuts move to a pointer/keyboard-accessible
  **Details** popover. Original actions, menus and the right-click customization
  remain. No permission policy or automatic-restart behavior changed.
- Health says “Vanta” rather than “Backend”; readiness is still derived from
  the existing authority. No claim that the backend is ready was manufactured.
- Details rows use visible labels, not tooltip-only icons or unexplained values.
  Their display-only tooltip metadata is omitted; shortcut registrations and
  original action/menu handlers stay intact.

Design principles: progressive disclosure and recognition over recall, stable
route identity, semantic tokens, visible focus and one Escape owner. Existing
Radix Popover/Menu and status controls are reused; no dependency or framework.
The new navigation phrase uses the established English-fallback locale path;
other languages were not independently translated in this slice.

## Verification

The navigation/status source-app criterion was executed: supporting routes remain
reachable, the quiet strip retains core state, Details retains its real menus,
and keyboard dismissal restores focus. This is not full app/card acceptance.

| Gate | Command / scope | Exit / result |
| --- | --- | --- |
| Source build | `node tools/build-vanta.mjs` from desktop-next | 0; existing font/chunk warnings remain. |
| Focused UI | `npx vitest run --project ui` with the nine files below, from apps/desktop | 0; 52 passed in 9 files. |
| Source Electron | `VANTA_KERNEL_BIN=/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-kernel-closeout-20261014/target/release/vanta-kernel node tools/proof/dn29-navigation-status.mjs` | 0; 24 assertions. Isolated profile/scripted model. |
| Renderer typecheck | `npx tsc -p . --noEmit` from apps/desktop | 2; inherited missing fixture below. |
| Size ratchet | `node --import tsx src/cli.ts lint --baseline` with the ten production files below, from vanta-ts | 0; 9 checked, locale data exempt; 16 inherited violations, none new/worse. |
| Brand | `node tools/brand/brand-scan.mjs` | 0; zero matches. |
| Proof syntax | `node --check tools/proof/dn29-navigation-status.mjs` and `node --check tools/proof/rows-chrome.mjs` | 0; syntax only, not the full legacy chrome replay. |
| Diff whitespace | `git diff --check` | 0. |

Focused test paths under apps/desktop:
`src/app/shell/{statusbar-presentation.test.ts,statusbar-visibility.test.tsx,approval-mode-menu.test.tsx,statusbar-context-menu.test.tsx,statusbar-accessible-name.test.tsx}`,
`src/app/shell/hooks/use-statusbar-items.test.tsx`,
`src/app/chat/sidebar/{vanta/navigation-group.test.tsx,chat-sidebar.integration.test.tsx}`,
and `src/styles/design-guard.test.ts`.

Size input paths under apps/desktop/src:
`app/shell/{statusbar-controls.tsx,statusbar-details.tsx,statusbar-presentation.ts,approval-mode-menu.tsx}`,
`app/shell/hooks/use-statusbar-items.tsx`, `app/shell/vanta/pane-toggles.tsx`,
`app/chat/sidebar/{index.tsx,vanta/navigation-group.tsx}`,
`i18n/{en_vanta_shell.ts,types_vanta_shell.ts}`. Baselines were not changed.

Saved report and four captures:
`proofs/dn29-navigation-status-2026-10-23/navigation-status-review.json`.
The already-running isolated native source preview was reloaded through its
View menu and raised; the updated navigation and strip were observed. The
installed app was not replaced. The final post-proof import reorder was
mechanical; focused source tests cover the same helper behavior.

Final preservation check: original 165-file and sidebar-start 169-file ledgers
are byte-identical. Of the 208 dirty/untracked files captured at navigation
start, only seven intentionally extended files changed: DESIGN.md, sidebar
index.tsx, pane-toggles.tsx, vanta-shell.css, vanta-sidebar.css, STATUS and
rows-chrome.mjs. Their earlier work was retained. No staged changes; HEAD is
unchanged. Newly added source/test/proof/docs files remain uncommitted.

The first TypeScript run found the prior titlebar's unsupported `Tip content`
prop; it is corrected to the house `label` prop. A second renderer check reports
only the pre-existing missing `tests/fixtures/session-resume-active-turn.json`
import in `use-session-actions.test.tsx`; that inherited fixture/test is untouched.
Canonical renderer typecheck is therefore **not green**.

The nested-menu proof exposed an autofocus tooltip that persisted after entering
another menu. Pointer-open and keyboard-open diagnostic replays differed: only
keyboard opening left “Open agents” active. Waiting longer did not fix it.
Details now labels the controls visibly and avoids those redundant tooltip
layers; the final real keyboard replay passed nested-menu dismissal and focus
return. Unit checks also preserve both the context count and percentage, and
keep active/failing work, updates and the existing Off warning prominent.

## Card order and boundaries

The current Trello **DN 1 — Slice 1: build next** list contains 19 open cards.
Open is not evidence of unimplemented work, and historic claims are not fresh
acceptance. No card is closed by this pass.

| Order / gate | Cards | Current action |
| --- | --- | --- |
| Now | DN-29 | Navigation/status source preview and narrow proof; broader migration remains open. |
| Same-slice evidence | DN-13, DN-20 | Keyboard/focus/layout checks and feature-location addendum only; not full release or 245-control acceptance. |
| Next engineering revalidation | DN-34, DN-25, DN-21, DN-22, DN-27 | Project-picker/project-switch/startup/parity/memory gaps; inspect current source and reproduce individually, not bulk-close. |
| Retained acceptance, not rerun wholesale | DN-03, DN-12, DN-11, DN-19 | Chat/permission/brand/launch gates. Narrow checks here do not establish their complete contracts. |
| Packaging/install held | DN-23, DN-24 | No packaging, installation or release authorized in this slice. |
| Owner decisions/acceptance | DN-28, DN-30, DN-31, DN-32, DN-33 | Offline queue, reset acceptance, restart policy, mini presence and new plan/card scope remain gated. No erase/reset or new feature attempted. |

Live Trello DN-34 currently names the Home project-picker defect, not the
`own-a-job` trial named in the older handoff. Do not merge those two scopes or
silently repurpose the card. Root `roadmap.json` remains canonical; no product
status or generated roadmap projection changes are implied by this UI slice.

## Not established

Installed-app/normal-profile behavior, real-provider business work, full suite,
complete VoiceOver/accessibility, worker execution, release and every card's
acceptance remain unverified here. Known unsupported shim errors and inherited
font/chunk build warnings remain. No commit, push, tag, install, deletion,
credential access or owner-gated restart-policy change.
