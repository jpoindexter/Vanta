# Managed Installation

Vanta supports three installation paths. Preserve existing profiles and data
when changing an installation; do not run two app versions on the same profile.

- **Desktop app:** download the signed and notarized Apple Silicon macOS release when you want the native operator workbench without a source checkout.
- **Managed runtime:** for normal use, the public installer clones Vanta into `~/.vanta/app`, installs the global `vanta` command, and keeps the runtime separate from your projects.
- **Source checkout:** for development, clone the repository and run `./install.sh`. It continues to install from the checkout you are editing.

## Desktop App

[Download Vanta Desktop v0.1.4 DMG for Apple Silicon macOS](https://github.com/jpoindexter/Vanta/releases/download/desktop-v0.1.4/Vanta-0.1.4-arm64.dmg).
The normal release replaces Iris downloads. It contains the signed, notarized
and stapled app with bundled runtime/kernel; no source build or Python setup
is required. The same app remains available as a
[ZIP](https://github.com/jpoindexter/Vanta/releases/download/desktop-v0.1.4/Vanta-0.1.4-arm64.zip)
for manual installation and native updating.

1. Verify the download against `SHA256SUMS` on the
   [Desktop release](https://github.com/jpoindexter/Vanta/releases/tag/desktop-v0.1.4).
2. Quit Vanta and keep a rollback copy of an existing app. Open the DMG, drag
   `Vanta.app` to Applications and eject the image afterward. For the ZIP,
   extract it and move the app to Applications instead.
3. Open Vanta normally. No Gatekeeper bypass is required. Configure the chosen
   provider through existing settings if needed; credentials and approval grants
   are not copied from another installation.

Use **Vanta → Check for Updates…** for native update discovery. Installation
requires exact confirmation and safe work preparation; app rollback is retained.
Actual signed 0.1.3 → 0.1.4 replacement/relaunch passed on the authorized owner's
Mac. This is not clean-Mac acceptance or a complete native failure/rollback test.
Do not use the historical `v0.9.5` DMG as the current download. See the
[release evidence](releases/desktop-v0.1.4.md),
[native update record](desktop-update-integration-2026-11-17.md) and
[Desktop help](desktop-help.md) for setup, recovery and known limits.

## Managed Runtime

```bash
curl -fsSL https://raw.githubusercontent.com/jpoindexter/Vanta/main/install.sh | bash
```

The bootstrap installs only into its managed directory, delegates kernel and Node provisioning to Vanta's normal installer, and records the runtime for the global launcher. Re-running it updates a clean managed checkout. If that checkout has local changes, it is left untouched.

Useful options:

```bash
# Isolated config/data and runtime locations.
curl -fsSL https://raw.githubusercontent.com/jpoindexter/Vanta/main/install.sh | \
  bash -s -- --vanta-home "$HOME/.vanta-work" --dir "$HOME/.vanta-work/app"

# Provision runtime only, without the interactive provider prompt.
curl -fsSL https://raw.githubusercontent.com/jpoindexter/Vanta/main/install.sh | bash -s -- --non-interactive

# Build and open the Electron desktop app from the same managed runtime.
curl -fsSL https://raw.githubusercontent.com/jpoindexter/Vanta/main/install.sh | bash -s -- --desktop
```

`--desktop` installs the development dependencies needed for packaging and writes the app under `<managed runtime>/vanta-ts/release`. The application and CLI use the same `VANTA_HOME`, so sessions, skills, configuration, and provider credentials remain shared.

## Updating And Recovery

From a managed runtime, `vanta update` updates the runtime and refreshes dependencies. For a locally modified managed runtime, review or commit your changes before re-running the bootstrap installer; it intentionally refuses to overwrite them.

Desktop 0.1.4 supports **Check for Updates…**. Finish active work and approve
the exact version before restart. Do not reopen Vanta during replacement;
the updater relaunches it. Custom-profile/development launches use manual
installation. Quit and retain rollback before manually replacing an app; never
delete your profile to update. `vanta update` updates CLI/runtime, not Desktop.

The source-checkout installer remains the correct choice when contributing or making local code changes.
