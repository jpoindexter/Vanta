# Reachability triage and installed interface reference — 2026-10-23

## Scope and preservation

Done for this slice: reproduce F-115, F-116, F-122, F-232 and F-236 with full
failure notes, correct each demonstrated proof error, then execute its narrow
UI assertion. This is not completion of Desktop Next or its redesign.

Worktree: `/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-integration-20261013`.
Branch: `claude/desktop-integration-20261013`.
HEAD at inspection: `0b2f2dff8eb0b4bd0ecaf566116c204cadd13f35`.
Remote branch at initial inspection: `4781c705005af346871853d1b4a9a8322a4e85cd`.
No fetch, merge, commit, push, delete, installation or owner-profile write was
performed. The existing backup cron was not altered.

All 165 pre-existing modified/untracked regular files were hashed before work
and rechecked afterward: zero changed or missing. This includes the four
inherited source/test edits and all inherited proof artifacts listed by the
handoff. Only two proof modules were edited; this document and the PARKED
update record the evidence. Product code, licenses and the installed app were
not changed. Scratch proof homes were retained, not deleted.

## Baseline: full Playwright call logs

Run from `desktop-next`, after `node tools/build-vanta.mjs` (exit 0):

```sh
PROOF_ERR_LINES=10000 \
VANTA_KERNEL_BIN=/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-kernel-closeout-20261014/target/release/vanta-kernel \
node --input-type=module -e 'globalThis.__vantaKeepRoot = true; process.argv = [process.execPath, "tools/reachability.mjs", "--only=composer,pages", "--print"]; await import("./tools/reachability.mjs");'
```

The command exited 0 **with these five failed rows**. The harness exit status
does not by itself establish passing row verdicts. `PROOF_ERR_LINES` is an
existing harness setting; no logger was added. ANSI formatting alone is removed
below. Each timeout had only the single waiting entry shown here.

```text
F-115: locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Add context' })

F-116: locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Add context' })

F-122: locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /^Effort/ })

F-232: locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for getByText('Webhooks', { exact: true }).last()
```

F-236 did **not** throw a Playwright exception and has no exception call log.
It failed the proof's text predicate. The old note starts with sidebar body
text (`New chat | Sessions | Bots | ...`), not a browser error. A direct
inspection of `#/starmap` showed the actual overlay:

```text
Nothing learned yet

As Vanta builds skills and memories for your work, they appear here.
```

## One cause at a time

| Rows | Demonstrated cause and correction | Narrow executed result |
| --- | --- | --- |
| F-115, F-116 | The button's accessible name is `Attach`, supplied by `use-chat-bar-state.ts`, not `Add context`. Corrected the three stale locators in `rows-composer.mjs`. | `attachRows(ctx)`: F-115, F-116 and adjacent F-118 PASS; assertion process exit 0. |
| F-122 | The sandbox's current mock model has no effort levels; `ReasoningPill` correctly renders nothing. Read the real `/api/models` capability response and assert the unsupported control is absent. Retained the supported-model selection branch. | `pillRows(page)`: F-122 PASS; assertion process exit 0. Selecting effort on a supporting real model was not exercised. |
| F-232 | Shared policy `SHOW_WEBHOOKS=false` deliberately hides the entry because no receiver is served. Reuse that policy in the proof; assert the entry is absent. Retained the enabled-page check, which fails if enabled but unavailable. | `webhooksRow(page)`: PASS; assertion process exit 0. This is **not** evidence of working Webhooks. |
| F-236 | The empty graph has no `Memory Graph` heading. Assert its actual empty message inside the overlay with the named `Close memory graph` button. Remove the unexecuted palette-launch claim. | `memoryGraphRow(page)`: PASS; assertion process exit 0. Populated graph and palette launch were not exercised. |

Each follow-up used the existing `launchVanta`, seeded sandbox, `waitForShell`
and `ensureChat` helpers. The attachment follow-up installed the existing
native-dialog stubs; its scripted model received the image, answered, and the
chip cleared. URL/snippet checks establish menu presence, not completion of
those workflows. The script explicitly asserted each targeted result was
`PASS`; it did not rely on the reachability runner's exit status.

No combined or full-inventory rerun followed these distinct narrow proofs.
There was one unsuccessful diagnostic lookup of nonexistent `/api/model-settings`
(404); source inspection identified `/api/models`, used successfully afterward.
The shared policy import executed under Node 22.23.2; older Node compatibility
was not established.

Other checks: `node --check tools/proof/rows-composer.mjs`,
`node --check tools/proof/rows-pages.mjs`, and `git diff --check`: exit 0.

The build still warns about an unresolved Collapse-Bold font path, existing
chunk sizing/imports and deprecated chunk configuration. Sandbox renderer
errors still include unsupported `desktopPluginsRoot` and
`getRemoteDisplayReason` shim calls. These were not fixed by this slice.

## REA: what was actually examined

The installed `/Applications/ChatGPT.app` contains Codex resources: its ASAR
package identifies `openai-codex-electron`, product `Codex`, version
`26.1016.61520`. There was no separate `/Applications/Codex.app` to inspect.

- Native launcher SHA-256:
  `a6755e5c694d3bf5292a69c0db98a76b255e23d8b697525e24082f950d491944`.
- ASAR SHA-256:
  `c9945f821fcbaf48424933a82860beac4dd4ad8b8a5444a75568fa6e38a1ad4b`.
- REA artifact inventory: 26,838 occurrences, 24,361 nodes.
- The strict static inspection initially stopped on seven unpacked-file
  integrity contradictions. Read-only inventory continued with
  `record-and-continue`, retaining those contradictions. Their cause was not
  diagnosed; this is not a security or integrity pass.
- REA parsed three selected shipped modules: composer, sidebar children and
  composer placement state; 14,321 text bytes, 4,995 AST nodes, 185 findings,
  zero parse failures. 16,442 files were unselected; the semantic graph is
  partial, not an exhaustive reconstruction.
- Read-only, bounded ASAR reads examined selected shared/initial/primary/route/
  composer CSS entries and package metadata. No application source, fonts,
  images, branding, credentials or account state were copied into Vanta.
- No listening Codex/ChatGPT debugging endpoint was found. No debugging port
  was enabled, app restarted, runtime injected or live computed-style/hover
  capture performed. This evidence is **static**, not interaction acceptance.

REA inventory evidence:
`ev_b473a278f62517fe7b445dd1757f99017b78e90499772c95c0f79d05715637e9`.
Selected JS analysis evidence:
`ev_a183b0d5b4f4241f0d94499f7a2459b0fb038db6eaeb620b8ce4ca473fdd469d`.

## Useful reference patterns, not a wholesale code transplant

The shipped CSS contains multiple scopes. These are observed declarations,
**not** a claim that all values apply together in the active app:

| Reference evidence | Application to the existing Vanta shell |
| --- | --- |
| A 4px spacing unit; one scope uses 14px base and 12px small text. Other scopes differ. | Audit the existing spacing/type tokens against the approved wireframe; avoid per-component guesses. |
| Sidebar preferred width 275px, minimum 240px, maximum constrained by viewport; toolbar declarations include 46px and a separate 52px scope. | Check sidebar/content balance at each supported window width before choosing values. |
| Thread gutter 16px; composer bottom inset 16px or 24px by scope. | Align transcript and composer on one layout grid. |
| Composer scopes include 20px line height, 12px horizontal input padding, 8px footer spacing, 22px or 28px radii. | Map to Vanta's shared composer primitive and resolve conflicts with its existing role radii through owner visual review. |
| Sidebar elevation layers a hairline stroke with faint 3px/7.5px and 16px ambient shadows; composer layers a faint stroke with 2px/8px and broad ambient shadows. | Address the owner's missing sidebar/composer depth using shared elevation tokens, not dark outlines on every control. |
| Sidebar state variables switch action opacity, menu width, overflow and indicator visibility. | Review the existing row's idle/hover/focus/menu-open states together; keyboard behavior requires separate execution. |

Vanta mapping points: `apps/desktop/src/styles.css`,
`apps/desktop/src/styles/vanta.css`, theme presets, existing sidebar and composer
primitives. The wireframe and `docs/parity/wireframe-spec.json` remain the design
authority; this reference does not override them. Preserve Vanta branding and
the third-party notices. Packaged implementation is not evidence of a license
to copy proprietary interface code or assets.

## Owner gate and remaining work

DN-29 stage 2 explicitly requires owner eyes per surface. No theme, sidebar or
composer redesign was applied. Proposed next bounded surface: sidebar and
composer, using the approved wireframe plus this measured reference, followed
by owner visual review before continuing.

Unchanged owner gates include DN-33's separate plan card, the real job trial,
legacy-renderer removal decisions, public PR #66 edits and profile migration
confirmation. No cards were marked Done. No live provider, account, installed
build acceptance, full suite, broad reachability or populated memory test was
run in this slice.
