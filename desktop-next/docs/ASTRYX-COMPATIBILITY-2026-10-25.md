# Astryx compatibility — 2026-10-25

## Verdict: partial; do not install a second overlay system yet

The published components can consume Vanta's current colors, fonts and shadows
in a bounded Electron experiment. However, an Astryx menu nested in Vanta's
existing Radix popover closes both layers on one Escape. That violates the
existing one-gesture/one-layer contract. This is a reproduced integration
blocker, not a reason to weaken the keyboard test or discard existing features.

No production dependency, installed app, owner profile or approval policy was
changed. The installed composer remains source `14fee24d`. Whole DN-29 remains
open. This experiment does not establish a finished design or full-shell parity.

## Exact inputs and isolation

- Source snapshot: `32c98a7098761af75eab52aa8c38ba5713f7797e`.
- Registry-published `@astryxdesign/core` and `@astryxdesign/theme-neutral`:
  **0.7.4**, not the source manifest's unqualified 0.7.5. Requests for published
  0.7.5 returned E404. Registry artifacts:
  [core](https://registry.npmjs.org/@astryxdesign/core/0.7.4),
  [neutral theme](https://registry.npmjs.org/@astryxdesign/theme-neutral/0.7.4).
- Core integrity:
  `sha512-zd/XfUw8OH8Dj65w6cPYamMXgb11P7oIgrlXgyBGaHXKJi3aedkU17Q+lERgv7YL3Bv4/UKPMqKL/QZkvoay1w==`.
- Theme integrity:
  `sha512-IoGRxRpcAWao4jNL+HsV0t3rlCWeV4EYrzP54iRRRXEzU21XxMdBt+B63y+n/84mBkzyB38vGK/BuYkRbVDBtw==`.
- StyleX 0.19.1; React/React DOM 19.2.7, matching Vanta's pin. Existing Vite 8.2.0
  and Electron 43.8.1 are used. Install scripts were disabled. No upstream CLI
  or `init` ran, and no project instructions were rewritten.
- Private scratch: `/tmp/vanta-astryx-compat.Vh9yFX`. Retained evidence and source:
  `Vanta-backups/astryx-compat-20261025-ejk0BD`. The package lock, component
  fixture, layer/paint proof, build outputs and failed attempts are preserved.
  No proprietary reference-app code is part of this experiment.

The actual Vanta `ThemeProvider`, house Button and portaled Popover are imported
from the snapshot. The fixture is not the whole Vanta shell or backend. Its
Electron process uses isolated userData, no Node integration in the renderer,
and denied permission requests. No HTTP requests occurred during the bounded
interaction path. There is no local-storage Astryx mode or profile authority.

## What the experiment changed and observed

The adapter uses public `defineTheme`/`Theme` APIs. Astryx's mode is derived from
Vanta's `renderedMode`; it does not own another preference. Tokens alias the
existing Vanta semantic roles. Tailwind remains the reset owner, with an explicit
cascade order placing Astryx's prose/reset below Vanta's layers. No second
global reset is imported.

The initial 12 aliases were insufficient: a real heading outside the component
wrapper changed to Figtree and different line spacing. The strengthened canary
failed before correction. Mapping the heading/code/body families and leading
to Vanta's existing roles removed that observed collateral change. Popover
fill, shadow, neutral controls, icons and hover/pressed roles also require
explicit mappings; a matching accent alone is not a unified design system.

An earlier bounded pass (`proof-B1dWrq/result.json`) executes 14 checks:

- Vanta button, heading and root mode/skin/color-scheme are unchanged by the
  Astryx provider's mount/unmount.
- Real button activation, native disabled state/opacity, and the actual
  gradient hover overlay, not only `backgroundColor`.
- Light and dark native menu keyboard focus, disabled-item skipping and Escape
  focus return. The menu enters Chromium's real top layer; it is not falsely
  described as a React portal.
- An Astryx control in Vanta's actual body portal retains the expected painted
  foreground, background and font and activates through keyboard input.
- The same paint/focus checks in an alternate Vanta skin and a 640px window at
  native 125% zoom; no horizontal overflow or independent mode storage.
- No renderer errors or HTTP requests in that bounded path.

Color comparisons normalize browser color representations to pixel RGBA;
hover comparisons include `backgroundImage`. Root/heading checks were added
because an unaffected ghost button alone did not establish CSS isolation.

## New mixed-layer failure remains open

The extended fixture adds an Astryx DropdownMenu inside the existing Vanta
PopoverContent. It focuses the native menu item, then presses Escape. The
expected result is only the menu closing and focus returning to its trigger
inside the still-open popover. The actual result removes that trigger because
the containing popover also closes. The full extended proof fails; the earlier
14-check pass must not be presented as complete integration acceptance.

Source evidence explains the collision: Radix DismissableLayer owns a document
**capture** Escape handler; Astryx `Layer/layerStack` owns a document **bubble**
handler. Their independent stacks do not share a highest-layer decision.
Vanta's `lib/escape-layers.ts` currently coordinates app-level layers, not
these two library registries. Do not add an arbitrary delay, synthesize a
keypress, hide a native popover behind React, import private Astryx internals,
or bypass a required/unsaved dialog's dismissal policy to obtain a green check.

Before migration, choose one shared overlay ownership path or establish an
explicit public interop boundary that preserves close policies, composition,
focus restoration and one Escape per layer. Then rerun the failing nesting path
and the actual full shell. Theme providers must be stable at one application
root: Astryx sets HTML attributes globally and removes them on unmount, so
per-surface provider islands are not independent or safe substitutes.

## Cost and remaining proof

The bounded production fixture versus a house-Button/Popover baseline adds
389,858 raw JS bytes / 121,715 summed gzip bytes and 203,307 raw CSS bytes /
34,124 gzip bytes. These are fixture measurements including adapter and extra
controls, **not** the final Vanta application's size delta. The core tarball's
31.7MB unpacked size includes sources/declarations and is not shipped JS size.
The private lock's 16-package production audit reports zero advisories; it
does not clear Vanta's inherited dependency alerts.

Vite builds and renderer typecheck execute successfully. The build retains an
unresolved legacy Collapse-Bold font reference and existing chunk warnings;
the exercised fixture did not request that font. Full application startup,
all component/token roles, full contrast, audible assistive technology,
mixed-dialog focus arbitration, compiled theme distribution, owner visual
acceptance and installed Astryx integration remain unverified. MIT notices
must accompany any later distributed Astryx code. No card was closed.
