# Packaging Vanta Next (local, unsigned)

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
