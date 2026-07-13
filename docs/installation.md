# Managed Installation

Vanta supports two installation paths that share the same `VANTA_HOME` data directory (`~/.vanta` by default):

- **Managed runtime:** for normal use, the public installer clones Vanta into `~/.vanta/app`, installs the global `vanta` command, and keeps the runtime separate from your projects.
- **Source checkout:** for development, clone the repository and run `./install.sh`. It continues to install from the checkout you are editing.

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
