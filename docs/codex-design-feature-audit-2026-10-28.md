# Codex reference refresh: design details and useful Vanta capabilities

## Verdict

Vanta needs a coherent presentation of its existing agent, not another shell.
The current source already shares Home/chat composer styling. Its remaining
chrome candidate is retained for owner review, not installed. Two substantive
integration gaps deserve attention alongside that review: truthful queue/Steer
semantics and the Desktop voice transport.

This is a **read-only reference and source audit**, not a redesign delivery,
runtime parity result, or permission to transplant proprietary application code.
The implementation checkpoint inspected is `e87656c6` with its preserved dirty
inputs. Installed Vanta remains agent11; normal CLI remains the bdf5780a pin.

## What was actually inspected

- The locally installed bundle identifies itself as `openai-codex-electron`
  **26.1023.51421**, even though its filesystem name is `ChatGPT.app`. This is
  not independent evidence for two products. ASAR SHA256:
  `1c8ef1bef66e5fc416ae66eff8e6529972aa3601e27a1c7b5f61d6a292b957d3`.
- **Hopper through REA:** the 71,008-byte arm64 launcher, SHA256
  `44342669fea068c3d335eff7cc40ee110b34fa4ff3570bb03cc507bd73fe980d`.
  Hopper reports 79 procedures. Its `_main` at `0x100000748` resolves the
  Chromium framework and `ChromeMain`; it does not reveal the chat design.
  Evidence: `ev_d7c30a523053d25b861c3fe949360d676ba21da54487dd2d814ea00e8886d209`.
- **REA container inventory:** 22,826 file/directory occurrences including the
  root, with seven unpacked-native integrity contradictions retained as
  observed-untrusted. They were not executed, analyzed as trustworthy, or
  dismissed as harmless. Inventory summary:
  `ev_74e5f8534838e448b617603b3fb71657746bb72d5a2300d517237fca726cf680`.
- **All 383 packaged webview CSS files:** inert PostCSS parsing retained
  51,963 declarations, 22,745 rule selectors and 8,894 custom-property
  declarations. Every declaration's UTF-16 source offset is checked against
  its source property. Zero CSS parse failures. Compared by basename family
  with the October 25 inventory: 178 identical, 195 changed, 10 new families;
  two old families no longer occur. Hash-family matching is not semantic
  equivalence. The 2,266 state-selector matches are a bounded syntax query,
  not an accessibility or state-completeness score.
- **Six exact JS files through REA:** queue UI, home/thread chrome, theme,
  PR-hover data, attachment-undo wording and automation notification controls.
  61,748 source bytes parse as inert syntax, zero parse failures. Semantic
  coverage is partial and explicitly budget-limited; 17,460 other inventoried
  relevant files remain unselected. Summary:
  `ev_6abe42bb4f68a24adf5211429dcc2a144371501cb8162f9911d82d784ee4373c`.

Direct running-Codex UI access is safety-refused. No alternate UI/CDP/native
capture route was attempted. Consequently, current computed cascade, enabled
product branches, hover/focus appearance, native outer-window shadow and actual
interactions are **unverified**. User-supplied screenshots remain visual
references, not measurements of this newer version. No credentials, account
storage or conversation database was inspected.

Private raw reference evidence, scripts, per-file hashes, declaration/selector
locations and tool diagnostics are retained in the dated Codex-design backup.
They are not bundled Vanta assets. A complete-result MCP transport overflow was
recovered using its retained Evidence summary, not by repeating analysis. A
profileless-resource snapshot export was refused; compact summaries remain
saved and the analysis target was closed without a snapshot. The successful
Hopper-native Evidence export and native snapshot are separately retained.

## Design details to carry forward

These are **observed static declarations**, not active computed measurements.
Keep primitive → semantic → component aliases inside Vanta's existing theme
authority. Do not add a parallel theme or overlay stack.

The [compact token reference](codex-design-tokens-reference-2026-10-28.json)
retains eight exact primitive dimensions with source hashes/offsets and two
explicitly inferred semantic aliases. It is not an importable Vanta theme:
root, Electron/browser and component overrides must not be flattened together.

| Detail | Current Codex static reference | Current Vanta gap / action |
| --- | --- | --- |
| Surface depth | Root card shadow `0px 4px 16px 0px #0000000d`; page surface uses subtle stroke plus that card role. Peeking sidebar uses its own inset stroke plus card shadow. | Evaluate canvas, docked sidebar, peeking drawer and menus separately. A missing native OS window shadow is not fixed or measured by assigning every component a CSS shadow. |
| Rhythm | Root spacing `.25rem`; shared toolbar token `46px`, with product-specific overrides. | Vanta's 44px native drag band is deliberate. Match rhythm and control treatment before changing native geometry. Do not treat 1rem as 16px without observing its root. |
| Controls | Shared button size/variant roles; fine-pointer hover guards and a separate keyboard focus treatment. Hover-card text has 14/20 and 12/16 roles. | Vanta's default Button remains 12/16 and approximately 28px high, while menu rows use 14/20 and minimum 32px. Review the existing chrome candidate; broader shared-control density needs separate review. Preserve explicit micro/icon variants and content growth. |
| Composer | Separate radius, density, surface, attachment, input and footer roles; multiline/single-line and narrow/forced-colors branches remain distinct. | Current Home and chat already share `composer-surface` slots and Vanta's semantic fill/radius/shadow/inset. Do not rebuild that integration. Verify remaining floating/inline/HUD and installed visual states separately. |
| Transcript | Shipped conversation and queue resources are separate from the outer shell. | Retain Vanta's 720px conversation measure, plain assistant flow, tonal user bubbles, tool grouping, approvals, Stop and reading-position logic. Improve hierarchy rather than replace the transcript engine. |
| Menus / previews | Dedicated hover-card, tooltip, menu and dialog resources; preview data has explicit loading/unavailable/ready states and revision matching. | Reuse Vanta's Radix/house primitives. Astryx/Radix nested Escape ownership is not cleared. Show controls on keyboard focus as well as hover; distinguish unavailable from empty. |

Exact current CSS anchors include `app-shared-398c891a59df.css` offsets
137105 (spacing), 143769 (toolbar), 186621 (card shadow), 235286 (page shadow);
`app-primary-4ccde6131b6d.css` offset 14121 (peeking sidebar shadow);
`app-initial-161052524772.css` offset 7847 (composer surface shadow role) and
8366 (forced-colors override). Offsets are zero-based UTF-16, not line numbers.
These retain selector/layer/media scope in private evidence; they are not
global values to paste across every screen.

Current Vanta source anchors:

- [Shared composer](../desktop-next/apps/desktop/src/styles/vanta-composer.css),
  [Home slots](../desktop-next/apps/desktop/src/app/vanta/home/home-composer.tsx).
- [Button variants](../desktop-next/apps/desktop/src/components/ui/button.tsx),
  [surface/menu roles](../desktop-next/apps/desktop/src/styles/vanta.css),
  [sidebar](../desktop-next/apps/desktop/src/styles/vanta-sidebar.css),
  [titlebar](../desktop-next/apps/desktop/src/app/shell/vanta/vanta-titlebar.tsx).
- [Existing seven-file chrome review](../desktop-next/docs/UNIFIED-CHROME-REVIEW-2026-10-25.md):
  unapplied candidate, not a fresh implementation or owner approval.

## Features worth adopting or finishing

Static upstream labels/callbacks show design intent, not executed behavior.
Vanta classifications below are source-traced unless a separate dated receipt
is linked. Existing cards retain their full acceptance and status.

| Capability | What exists / what to use | Remaining work and existing home |
| --- | --- | --- |
| Chat, projects, history and search | Already source-wired through Vanta RPC/REST adapters. | Simplify exposure; search failure/recovery and installed parity still need their own proof. DN-29 / `DESKTOP-NEXT-CUTOVER`; do not add another creation wizard. |
| Visible follow-up queue | Codex queue module names edit/delete/reorder/send-now/open-side-chat/pause/resume callbacks, with explicit unknown-delivery and retry wording. Vanta already has a revision-checked durable queue and visible panel. | Complete existing queue recovery/attachment/paused-state contracts; do not automatically retry an unknown effect. DN-22 / `DESKTOP-NEXT-CUTOVER`. Upstream callbacks do not prove all upstream paths work. |
| Truthful Steer / Stop | Vanta's `sessionSteer` enqueues and moves an instruction to the front; backend `claimNext` consumes it later. Stop has its separate interrupt mapping. | This path establishes **priority run-next**, not immediate active-turn redirection. Reconcile the renderer's immediate-correction wording first. True live steering needs an explicit safe execution boundary and duplicate-effect proof. Do not infer upstream live steering from its label either. DN-22 / `DESKTOP-NEXT-CUTOVER`. |
| Drafts, attachments and Undo | Codex ships attachment-restored feedback; Vanta already has attachment/draft custody work. | Review whether all removal paths are reversibly recoverable; require exact restart/switch ownership and one submit. A toast alone is not Undo implementation. `DESKTOP-NEXT-CUTOVER` / `UX-04`. |
| Contextual workbench / previews | Vanta already has Changes, Terminal, Browser, Files and artifacts. Codex PR preview data checks host/account availability and matches head revisions before exposing diff counts. | Consolidate existing panels into contextual Review; preserve exact-origin/source/revision and loading/error truth. Do not add a duplicate workbench or infer authenticated access. `UX-04` / existing browser cards. |
| Voice / dictation | Imported Desktop UI requests `/api/audio/transcribe`, speech and audio leases/streams. Vanta routes expose `/api/voice/transcribe` and `/api/wake`; the inspected Vanta adapters do not bridge those routes. | **Transport integration remains unproven**, not working simply because a mic is present. Trace and bridge the current contracts before testing mic, local downloads, STT/TTS, interruption, permissions and CLI parity. DN-22 V-004/V-005 and `VOICE-LOCAL-MODELS-AND-PROVIDERS`. |
| Quiet recurring work | Codex ships failed-only/important/all-run notification options and existing-chat/new-chat destination labels. Vanta already has schedules, Mini, Quick Entry and native notifications. | Reuse them with explicit target/expiry/budgets, sleep/offline truth and no focus hijacking. Verify preference persistence/delivery before claiming ambient autonomy. `OP-03`, `UX-04` and existing schedule-continuity card. No paid/remote service is introduced. |
| Model / effort controls | Already source-wired in Vanta, including scoped capability validation. | Preserve unsupported-capability refusals and truthful model discovery. Local-model management is a separate partial capability, not solved by adding a dropdown. Existing model cards. |

Critical source anchors:
[Steer adapter](../desktop-next/apps/desktop/src/api/vanta/handlers-prompt.ts)
lines 85–108 → [durable queue](../vanta-ts/src/desktop/turn-queue.ts)
lines 162–184; [audio client](../desktop-next/apps/desktop/src/api/system.ts)
lines 189–256 versus [server routes](../vanta-ts/src/desktop/server-routes.ts)
and [explicit RPC mapping](../desktop-next/apps/desktop/src/api/vanta/dispatch.ts).
Negative search is bounded to those renderer/native adapter and backend route
trees; it is not a proof that no possible external plugin supplies an adapter.

## Dependency-ordered next three slices

1. **Review the retained sidebar/titlebar candidate.** DN-29; obtain owner
   acceptance of that surface before promotion. Preserve approved composer,
   drag geometry, navigation, keyboard and light/dark/forced-colors behavior.
2. **Make queue intent truthful and prove safe control.** DN-22 / `DESKTOP-NEXT-CUTOVER`;
   distinguish run-next, queued, sending, interrupted, failed and unknown. Any
   live redirection must retain cancellation and exact-effect authority.
3. **Close the voice transport seam.** DN-22 / existing voice card; first
   trace one supported transcription path, without new dependencies or paid
   provider assumptions, then prove mic/local-provider/CLI journeys separately.

Broader token rollout, unread/reading-position continuity, workbench polish,
local model management and human acceptance remain recorded on existing cards;
none becomes Done through this research. No new WIP slot is created.

## Proof and scope

Executed: Hopper native inspection/export; REA container inventory and six-file
inert JS analysis; all-CSS parsing/hash/offset checks; source tracing and a
separate read-only Vanta gap review. The original dependency candidate is
preserved separately and not promoted by this audit.

Not executed: running-Codex UI/computed styles, Vanta visual comparison, new
queue/voice runtime behavior, microphone, live accounts, full contrast/VoiceOver,
owner acceptance, a fresh app build or installation. No product feature was
implemented by this report. No proprietary source/assets were copied into
Vanta. Independent implementation of useful patterns is the adoption route;
any source reuse requires a verified license for that exact source, not the
assumption that a CLI repository licenses a proprietary Desktop shell.
