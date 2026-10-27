# Shared native environment helper — source checkpoint

This is one proven extraction, not complete Desktop modularization or a new
installed app. Home1/code `feea5a4f` remains the installed identity.

## Smallest complete seam

The existing 29-line environment helper moves byte-identically from the legacy
Electron directory into `vanta-ts/desktop-native/runtime-env.mjs`, beside the
already shared runtime-launch helper. Desktop's launcher imports that path.
The classic app keeps its public import through a compatibility re-export;
the shared file is explicitly included in classic packaging's `build.files`.
No permission, environment precedence, dependency, API or capability changes.

Review found the declared package-source roots omitted `desktop-native`.
The extraction therefore also adds that folder to provenance capture, covering
both native helpers. A same-commit regression failed before this correction:
changing helper bytes did not change the digest. After correction, edits to
either helper invalidate source identity and trigger the existing stale-input
refusal. Source/assembly provenance remains declared and non-hermetic; this
does not prove the source-root inventory is exhaustive.

## Parent-executed evidence

- All five proposed file postimages match the independently reviewed packet;
  the two provenance files are the parent's additional correction.
- Eight canonical helper/layout tests and 12 launcher tests pass: import
  identity, exact macOS PATH precedence/deduplication, empty/missing PATH,
  unchanged caller objects, simulated non-macOS copies and declared staged
  classic-layout resolution. That fixture is not a full electron-builder ASAR.
- Actual `buildServerCommand` is bundled from canonical source and its generated
  environment reaches real Node child probes for packaged/unpackaged options.
  The bundle input list uses the neutral helper, not the legacy implementation.
- Thirteen provenance/installer-source checks pass, including the new red→green
  helper test. These package/installer cases use fixture bundles, not Apple.
- Electron typecheck and actual canonical main/preload bundling pass. Six
  changed code/test files have zero strict size findings.
- A private actual source Electron journey passes four checks: one deliberate
  ordinary chat, exact unsent draft after quit/relaunch without replay, unchanged
  original project files, and zero errors in both renderer lifetimes.

The native journey uses private homes/projects/user-data and a loopback scripted
model. It is source-runtime evidence, not an installed release, real MCP server,
live account, Windows/Linux hardware or normal owner-profile acceptance.
Renderer/runtime outputs were reused because this extraction changes only the
native import and package-source guard; the canonical native entry was rebuilt.

Current direct dependency inventory is six legacy native modules across nine
import declarations, including a type-only import. Older eight-module inventory
records are historical. The old renderer, its routes and capabilities remain;
retirement still requires owner per-item parity approval.

Preimages, parent test/build/consumer/native results and screenshots are retained
in `runtime-env-parent-20261027-Sho0gY`; frozen proposal and independent evidence
are in `runtime-env-extract-20261027-CRpmOn`. No full suite, new app package,
signing/notarization/install, owner visual acceptance or whole-card closure is
claimed by this source checkpoint.
