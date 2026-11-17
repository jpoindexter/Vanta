# Managed Installation

Vanta supports three installation paths. Preserve existing profiles and data
when changing an installation; do not run two app versions on the same profile.

- **Desktop app:** download the signed and notarized Apple Silicon macOS release when you want the native operator workbench without a source checkout.
- **Managed runtime:** for normal use, the public installer clones Vanta into `~/.vanta/app`, installs the global `vanta` command, and keeps the runtime separate from your projects.
- **Source checkout:** for development, clone the repository and run `./install.sh`. It continues to install from the checkout you are editing.

## Desktop App

[Download Vanta Desktop v0.1.0 for Apple Silicon macOS](https://github.com/jpoindexter/Vanta/releases/download/desktop-v0.1.0/Vanta-0.1.0-arm64.zip).
The normal release replaces the separate Iris test downloads. It is a ZIP
containing a Developer ID signed, Apple-notarized and stapled `Vanta.app` with
its bundled runtime and kernel; no source checkout/build is required.

1. Verify the ZIP against `SHA256SUMS.txt` on the
   [Desktop release](https://github.com/jpoindexter/Vanta/releases/tag/desktop-v0.1.0).
2. Quit any running Vanta. Keep a rollback copy of an existing app, extract the
   ZIP and move `Vanta.app` into Applications.
3. Open Vanta normally. No Gatekeeper bypass is required. Configure the chosen
   provider through existing settings if needed; credentials and approval grants
   are not copied from another installation.

This release has **no published DMG or enabled automatic updater**. Do not use
the older `v0.9.5` DMG as the current Desktop download. Current package identity,
checksums and remaining boundaries are in the
[release notes](releases/desktop-v0.1.0.md). The owner's verified upgrade and
rollback are recorded in the [installation receipt](desktop-v0.1.0-install-2026-11-17.md).
The [installer comparison and delivery cards](desktop-installer-hermes-audit-2026-11-17.md)
separate DMG delivery, first-run setup and safe updating; none is implied by
the historical managed-runtime installer.

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

For the installed Desktop, download the explicitly versioned Desktop release,
quit the app and retain a rollback copy before replacing it. `vanta update`
updates the CLI/runtime; it does not establish a Desktop app update. Automatic
Desktop updating remains unconfigured in v0.1.0. Ordinary users do not need to
build the app from source.

The source-checkout installer remains the correct choice when contributing or making local code changes.
