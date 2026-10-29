# Project chats and quieter sidebar — 2026-10-23

Owner authorized continuing dependency-ready cards, preserving all work and
prohibiting commit/push. Target: Vanta-integration-20261013, branch
claude/desktop-integration-20261013, HEAD
`0b2f2dff8eb0b4bd0ecaf566116c204cadd13f35`.

## Outcome / Now

DN-34 source criterion: two registered projects appear on Home; choosing the
second and submitting starts the original instruction in that project's real
runtime. DN-29 continuation: everyday chat terminology and quieter headings.

The initial real-app check reproduced a routing bug: both chips and the picker
worked and Beta was selected, but the chat ran in Acme. The picker reads the
loaded flat project list; the task adapter resolved folders only from the
independently loaded sidebar tree. With no tree entry it silently started in
place. The adapter now also resolves the selected ID through the already-loaded
project list's primary_path. No new store, API or permission rule.

A second test captured a related boundary before fixing: projects arriving
after Home mounts made the picker display the first project while submission
passed null. Home now derives one effective selected ID for picker, chips and
submission. Explicit selection, same-folder and cancellation paths remain.

Sidebar pane/group/search/empty copy now says Chats instead of Sessions; Cron
jobs becomes Schedules. All nine bundled languages updated using existing
keys. Section labels use sentence case without uppercase tracking. Routes,
IDs, filters, profile/Bot identities, schedules and shortcuts are unchanged.
Bots were not renamed to Agents: those are distinct existing concepts.

Principles applied: recognition over recall, single source of truth, lower
extraneous cognitive load, semantic tokens and native keyboard controls.
Existing components reused; no dependency or new token.

## Executed evidence

| Gate | Command / scope | Exit / result |
| --- | --- | --- |
| Before-fix source UI | DN-34 proof command below | 1; Beta selection incorrectly ran in Acme; kept root vanta-desktop-0F8WXu. |
| Regression tests before fix | Separate project-task.test.ts and home-page.test.tsx runs | Both exit 1; new tests failed as intended. |
| Final focused UI | Six-file command below | 0; 38 tests / 6 files. |
| Build | `node tools/build-vanta.mjs` from desktop-next | 0; existing font/chunk/deprecation warnings. |
| Final real UI | DN-34 proof command below | 0; 11 checks: chips, radio picker, selected label, actual runtime switch, new project status, original prompt/reply, Chats/search/sentence-case schedule heading. |
| Renderer types | `npx tsc -p . --noEmit` from apps/desktop | 2; only inherited missing session-resume-active-turn.json fixture. Not green. |
| Size | `node --import tsx src/cli.ts lint --baseline` with absolute project-task.ts and home-page.tsx paths, from vanta-ts | 0; both within 300/50/4/10. Baselines unchanged. |
| Brand / syntax | `node tools/brand/brand-scan.mjs`; `node --check tools/proof/dn34-project-chat.mjs` | 0; brand zero matches. |
| Whitespace | `git diff --check` | 0. |

From desktop-next:

```sh
VANTA_KERNEL_BIN=/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-kernel-closeout-20261014/target/release/vanta-kernel node tools/proof/dn34-project-chat.mjs
```

From apps/desktop:

```sh
npx vitest run --project ui src/app/vanta/home/project-task.test.ts src/app/vanta/home/home-page.test.tsx src/app/vanta/home/use-home-props.test.tsx src/i18n/sidebar-chat-copy.test.ts src/app/contrib/sessions-pane-tab-title.test.tsx src/styles/design-guard.test.ts
```

An initial all-locale assertion wrongly assumed Russian search copy must contain
the nominative heading (“Чаты” / “Поиск чатов”). The test was corrected to check
exact headings and label/placeholder consistency; production wording unchanged.
Known jsdom canvas warnings occurred in pane-title tests.

Evidence: `proofs/dn34-project-chat-2026-10-23/dn34-project-chat.json`,
`01-project-choice.png`, `02-project-chat.png`. Final scratch root:
`/var/folders/rj/nj_9qs2s7zs52nsc90yl2q700000gn/T/vanta-desktop-XfE3MF`.
Private data and local scripted model only. Real IPC/server switching exercised;
only final OS dialogs stubbed. The updated source preview was also launched
visibly with fixture chats and its own data (vanta-desktop-8DKdLb); native
inspection observed Chats, Search chats and Schedules. Not the installed app.

## Next / Later / Re-entry

- DN-34's stated source real-app criterion passes. Record bounded closure in
  Trello, not a release or product-wide completion.
- DN-22 V-044 receives this evidence; the rest of that card is not recertified.
  Historical CUTOVER-PARITY rows are not rewritten as fresh whole-app claims.
  DN-29 wider token migration and installed visual signoff remain open.
- DN-21/DN-25 load/flake marathons remain owner-parked. DN-28/30/32/33 and
  live-account/worker acceptance still require their specific authority.
- Next engineering re-entry: inspect one remaining DN-22 parity row against
  current source and execute only its narrow real path, not a broad proof run.

Not established: installed/normal profile, real provider, full accessibility,
load reliability, native UI for every locale, full suite or new packaging.
Unsupported desktopPluginsRoot/getRemoteDisplayReason errors remain. No normal
data, credentials, protected sources, generated roadmaps or Git history changed.

Preservation check: of 234 inherited modified/untracked files, only the four
intentional extensions changed: ERRORS.md (append), DESIGN.md, vanta-sidebar.css
and STATUS. All other entries are byte-identical, including protected inherited
tests and proof folders. HEAD unchanged; nothing staged. Newly modified clean
source files and new tests/proof/docs are the scoped additions described above.
