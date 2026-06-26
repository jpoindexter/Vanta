#!/bin/sh
# Vanta — download & run.
# First run bootstraps (builds the Rust safety kernel, installs agent deps);
# every run after is instant. The kernel auto-starts when the agent needs it.
#
#   ./run.sh run "read README.md and summarize it"
#   ./run.sh skills | rooms | modes install | schedule list | auth google
#   ./run.sh                       # prints the command list
#
# Provider defaults to local Ollama (qwen2.5:14b, no API key). Edit vanta-ts/.env
# to switch to OpenAI/Anthropic.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

# --- self-register this location ---------------------------------------------
# Record where the repo lives so the global `vanta` launcher always finds us —
# even after the repo is moved. Running `./run.sh` (or `vanta`) once from the new
# location updates the pointer; no install.sh re-run needed.
VANTA_STATE_HOME="${VANTA_HOME:-$HOME/.vanta}"
mkdir -p "$VANTA_STATE_HOME" 2>/dev/null || true
# Subshell isolates the redirect failure so the shell's own error message goes
# to the subshell's stderr (redirected to /dev/null) rather than our output.
( printf '%s\n' "$DIR" > "$VANTA_STATE_HOME/repo-path" ) 2>/dev/null || true

# --- no-toolchain helpers (kernel + node download), shared with install.sh ----
. "$DIR/scripts/setup-lib.sh"
vanta_use_vendored_node

# --- one-time bootstrap (kernel + node + deps) -------------------------------
if [ ! -x "$DIR/target/debug/vanta-kernel" ]; then
  echo "vanta: acquiring the safety kernel (first run only)…" >&2
  if ! vanta_fetch_prebuilt_kernel "$DIR"; then
    if ! command -v cargo >/dev/null 2>&1; then
      echo "vanta: no prebuilt kernel for this platform and Rust isn't installed." >&2
      echo "  Install Rust (https://rustup.rs) or re-run ./install.sh." >&2
      exit 1
    fi
    (cd "$DIR" && cargo build)
  fi
fi
if ! vanta_ensure_node; then
  echo "vanta: Node.js 22+ not found and couldn't be downloaded. Install it: https://nodejs.org" >&2
  exit 1
fi
if [ ! -d "$DIR/vanta-ts/node_modules" ]; then
  echo "vanta: installing agent dependencies (first run only)…" >&2
  (cd "$DIR/vanta-ts" && npm install --omit=dev)
fi

# --- launch (cli.ts finds the repo root from its own path; cwd is irrelevant) -
# Run the CLI via `node --import tsx` (the loader), NOT the `tsx` CLI binary. The tsx CLI
# starts an IPC server — it listen()s on a $TMPDIR/tsx-*/<pid>.pipe unix socket — which the
# OS sandbox DENIES (EPERM, and seatbelt's network* family doesn't cover a unix-socket listen
# under deny-default). So a self-CLI call (e.g. `vanta skills …`) made under VANTA_SHELL_SANDBOX
# fails. The loader has no IPC server, runs cli.ts identically, and keeps stdin/stdout a real
# TTY (which the Ink TUI needs; npx could interpose a non-TTY pipe). See VANTA-SANDBOX-TSX-SELFCALL.
cd "$DIR/vanta-ts"
if [ -d "node_modules/tsx" ]; then
  TSX="node --import tsx"
else
  TSX="npx tsx"   # degraded fallback (deps not installed) — still carries the IPC server
fi

# Relaunch loop: /restart exits with code 75 → re-run tsx so edited source is
# picked up without quitting to the shell. Any other exit code passes through.
# VANTA_RELAUNCH tells the agent the loop is active (so /restart is offered).
export VANTA_RELAUNCH=1

# V8 heap headroom: node's default old-space cap is ~4GB, and large extractions
# or long sessions can exceed it (a default-heap node OOMs near 4GB — observed).
# Raise the ceiling; override (MB) via VANTA_NODE_MAX_MB. Appends to any existing
# NODE_OPTIONS rather than clobbering it. This raises the ceiling, not a leak fix.
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=${VANTA_NODE_MAX_MB:-8192}"

while :; do
  if $TSX src/cli.ts "$@"; then code=0; else code=$?; fi
  [ "$code" = 75 ] || exit "$code"
  echo "vanta: reloading…" >&2
done
