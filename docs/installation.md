# Managed Installation

Vanta supports two installation paths that share the same `VANTA_HOME` data directory (`~/.vanta` by default):

- **Desktop app:** download the signed and notarized Apple Silicon macOS release when you want the native operator workbench without a source checkout.
- **Managed runtime:** for normal use, the public installer clones Vanta into `~/.vanta/app`, installs the global `vanta` command, and keeps the runtime separate from your projects.
- **Source checkout:** for development, clone the repository and run `./install.sh`. It continues to install from the checkout you are editing.

## Desktop App

[Download Vanta v0.9.5 for Apple Silicon macOS](https://github.com/jpoindexter/Vanta/releases/download/v0.9.5/Vanta-0.9.5-arm64.dmg). The DMG is Developer ID signed, Apple notarized, stapled, and distributed with SHA-256 `b1c97ecd59bc8c37a6d2c843e81d4a74f44c75cf4a7f9bdb8a0e46594554f122` on the [v0.9.5 release](https://github.com/jpoindexter/Vanta/releases/tag/v0.9.5). Open the DMG and drag Vanta into Applications.

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

For an installed app, rebuild the desktop artifact from the managed runtime with:

```bash
cd "$HOME/.vanta/app/vanta-ts"
npm run desktop:pack
```

The source-checkout installer remains the correct choice when contributing or making local code changes.
