# Packaging Vanta (local candidate)

## Current path — 2026-10-25

From `desktop-next`, install dependencies with Node22.12+ (the app's supported
Node engines still apply), then run `npm run vanta:package`. The build resolves
Electron through the prepared workspace whether nested or hoisted, and runs
its checksum-verified `install.js` when the platform binary is missing.
Electron42+ does not download its binary in postinstall. No symlink workaround
or hard-coded apps/desktop/node_modules/electron directory is required.

For Developer ID signing, set `VANTA_SIGN_IDENTITY` to an existing signing
identity. Set `VANTA_KERNEL_BIN` to the approved existing release kernel to
avoid an unrequested Rust rebuild. Packaging writes Vanta.app, a ZIP and
bundle-report.json under apps/desktop/release/mac-arm64; it does not replace
the installed app, notarize, upload a public release or change runtime state.

Notarize separately with `node tools/notarize-app.mjs` and the existing Keychain
profile. Generate the deliverable ZIP after stapling so it carries the ticket.
Before replacing /Applications/Vanta.app: preserve source/previous app/private
state, verify signature/ticket/build identity, and refuse to interrupt active
work. Check the exact installed path afterward, not just the source bundle.

Current executed delivery and remaining gates are recorded in
[COLD-RECOVERY-2026-10-25.md](COLD-RECOVERY-2026-10-25.md). Earlier
[INSTALLED-DELIVERY-2026-10-25.md](INSTALLED-DELIVERY-2026-10-25.md) receipts
remain historical evidence for their exact source versions.
Dependency changes require their own dated proof; Apple acceptance does not
certify dependency security. No public release, legacy removal or data deletion
is implied. Original packaging notes below are historical, not current setup,
uninstall or security-bypass instructions.

## Historical unsigned prototype notes (superseded)

Produces `Vanta Next.app` (arm64): ad-hoc signed, not notarized, not published, not installed.

## Command

From `desktop-next`: `npm run vanta:package` (about 1 minute). Output in `apps/desktop/release/mac-arm64/`:
`Vanta Next.app`, `Vanta-Next-<version>-arm64.zip`, `bundle-report.json` (size, 10 largest files, symlink and brand-string audit).

Prove it boots: `node tools/prove-packaged.mjs [--runs 2]` (sandbox, hidden window, canned model; writes `docs/proofs/packaging/`).
Prove nothing is left running after quit, SIGTERM and SIGKILL of the app: `node tools/prove-kernel-lifecycle.mjs` (writes nothing unless `--out`; results in `docs/proofs/kernel-lifecycle/`).
Unit tests: `npm run vanta:package:test`. Icons: `node tools/make-icons.mjs` (from `vanta-ts/desktop-app/build/vanta-brand-icon.svg`).

## Prerequisites

Node 22+, installed `desktop-next` and `vanta-ts` dependencies, the Electron binary in `apps/desktop/node_modules/electron/dist`,
macOS with `plutil`, `codesign`, `ditto`, `iconutil`. Nothing is downloaded. The kernel is `target/release/vanta-kernel`;
if missing it is built with `cargo build --release --locked --offline` (no dependencies to fetch), else the debug kernel is used
(override with `VANTA_KERNEL_BIN`).

## Inside the app

- `MacOS/Vanta Next` plus renamed `Vanta Next Helper*` apps; bundle id `studio.theft.vanta-next`; URL scheme `vanta://`; own userData (`~/Library/Application Support/Vanta Next`).
- `Resources/app.asar`: built renderer, Electron main and preload, tray/dock assets (the identity comes from `product-identity.cjs` and `electron-builder.config.cjs`, read by `tools/package-vanta.mjs`).
- `Resources/vanta-runtime/`: precompiled runtime (`dist-runtime/cli.mjs`), `src/` (assets the bundle reads), legacy server-served renderer, `package.json`, and production `node_modules` as real files (247 packages, includes the tsx fallback). No symlinks.
- `Resources/kernel/vanta-kernel` (release build, executable).
- `Resources/LICENSE`, `LICENSE-THIRD-PARTY-MIT`, `NOTICE.md` (MIT attribution), `LICENSE.electron`, `LICENSES.chromium.html`.
- The runtime runs under the app's own binary with `ELECTRON_RUN_AS_NODE`, so the RunAsNode fuse stays on. Runtime lookup: `VANTA_RUNTIME_ROOT`, else `Resources/vanta-runtime` (`electron/vanta/runtime-root.ts`).
- Updates: no feed; the app reports updates as not configured.

## Open it (unsigned)

A build made on this Mac has no quarantine flag, so double-click works. A copy that arrived by download or AirDrop is blocked by Gatekeeper:
right-click the app, Open, Open again; or `xattr -dr com.apple.quarantine "Vanta Next.app"`. `spctl --assess` reports it as rejected: expected for an ad-hoc signature.

## Uninstall

Delete `Vanta Next.app`, then `~/Library/Application Support/Vanta Next`. It never touches `Vanta.app` or `~/.vanta` unless you point the app at them.

## Known gaps

Developer ID signing and notarization; hardened runtime and entitlements; auto-update feed; DMG (art exists, `electron-builder` path not exercised);
Intel and universal builds; Windows and Linux packages; trimming the runtime (about 246 MB, mostly TypeScript compilers, exceljs, playwright-core, esbuild);
the renderer still contains Hermes/Nous identifiers (`window.hermesDesktop`, some strings).
