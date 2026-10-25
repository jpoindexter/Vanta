# One Vanta design system

## Owner direction and scope

On 2026-10-25 the owner approved
[the composer treatment](design-proposals/composer-first-surface-2026-10-25.html),
then requested a unified design using Meta's Astryx. Composer approval applies to
that surface, not blanket acceptance of every other screen. DN-29 remains open.

The target is **Codex-like workflow and restraint, Vanta identity, one shared
design foundation**. Astryx is a candidate component foundation, not a second
theme layered over the app, another shell, or a replacement agent engine.

## Verified upstream fit

Reviewed upstream HEAD `85e48a0e5d96fdd2492598ac8085ff8148460cb5`:

- [Core package](https://github.com/facebook/astryx/blob/85e48a0e5d96fdd2492598ac8085ff8148460cb5/packages/core/package.json)
  declares React/React DOM >=19 and StyleX ^0.19 peers. Vanta currently pins
  React/React DOM 19.2.7. Matching this major is necessary, not integration proof.
- [Core setup](https://github.com/facebook/astryx/blob/85e48a0e5d96fdd2492598ac8085ff8148460cb5/packages/core/README.md)
  supports prebuilt CSS with Tailwind and custom themes; application code need
  not migrate to StyleX authoring or add a build plugin.
- [Theme implementation](https://github.com/facebook/astryx/blob/85e48a0e5d96fdd2492598ac8085ff8148460cb5/packages/core/src/theme/Theme.tsx)
  can synchronize root theme attributes and styles for portals. Vanta already
  owns root mode/profile/skin state: two independent theme authorities would
  conflict, so this seam must be reconciled before adoption.
- [MIT license](https://github.com/facebook/astryx/blob/85e48a0e5d96fdd2492598ac8085ff8148460cb5/LICENSE)
  requires retaining the copyright and permission notice when distributing
  copies or substantial portions. Existing third-party notices remain intact.
- Upstream describes the system as Beta. The reviewed source package says
  0.7.5; no npm artifact/version or Vanta installation is certified here.

## Single-authority contract

Use the existing Vanta theme/token authority. Components consume semantic roles;
an Astryx integration must map to those same values, including portaled menus,
dialogs and tooltips. It must not introduce another persisted mode, independent
palette, per-page style vocabulary or alternate composer state.

| Shared decision | Required consistency |
| --- | --- |
| Colour | White/grey default direction, Vanta accent; preserve light/dark/system preference and contrast |
| Type | One system font stack and named size/line-height roles; preserve user text sizing |
| Space and size | One spacing scale and control-density contract across Home, chat and utility pages |
| Shape and depth | Shared control/surface radii, composer role, quiet hairlines and layered elevation |
| Interaction | Same hover, selected, pressed, disabled, busy and error states; visible keyboard focus |
| Content | Chat-first labels; reveal machinery progressively without hiding consequential action previews |

Existing sources include `src/themes/context.tsx`, `src/styles.css`,
`src/styles/vanta-composer.css` and `src/components/ui/`. Consolidate consumers
onto these contracts instead of minting another namespace. Do not overwrite the
owner's uncommitted `docs/DESIGN-TOKENS.md` or `docs/FEATURE-PRESERVATION.md`.

## Dependency-ordered execution

1. Apply the approved composer consistently to Home and conversation surfaces,
   including floating/inline instances where the same controls are reused.
   Preserve text, images, voice, attachments, model/access selection, queues,
   shortcuts, focus and submission semantics. No fake functionality from the
   proposal enters the app.
2. Validate an Astryx primitive plus one portaled interaction in an isolated
   integration. Check actual Vite/Electron output, cascade/reset collisions,
   persisted modes, focus/keyboard ownership, contrast, narrow layout and bundle
   impact. Pin the reviewed published artifact before adding a dependency.
   Do not run upstream `init` against project instructions automatically.
3. Once that seam works, migrate shared controls in bounded surfaces: sidebar
   and titlebar; menus/dialogs/settings; transcript/activity and workbench panels.
   Each migration replaces the old presentation of the same capability. Keep
   DN-29's owner-review gate per surface and retain unmigrated behaviour.

Do not install a global CLI, copy a whole upstream shell, replace the rich editor
or transcript engine, add a new token build pipeline, or reset every screen to
upstream defaults merely to obtain consistency.

## Proof of Done

Unification is accepted only when the actual installed build uses the same
shared contracts on the named surfaces, retains their capabilities and passes
their narrow real interaction path. Compare light/dark, keyboard focus, menu
portals, narrow windows and normal chat; obtain owner visual acceptance per
surface. A rendered proposal, matching React major, token inventory or green
build alone cannot establish this.

Current state: composer direction approved and source treatment applied, with
22actual source-app checks and the limits in COMPOSER-RECOVERY-2026-10-25.md.
Upstream/source feasibility reviewed; no Astryx dependency added, no cross-app
migration or installed redesign claimed.
Draft-custody/restart engineering continues separately; visual work must not
weaken its data-preservation checks or approval boundaries.
