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
printf '%s\n' "$DIR" > "$VANTA_STATE_HOME/repo-path" 2>/dev/null || true

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
# Use the local tsx binary directly (not `npx`) so stdin/stdout stay a real TTY —
# the Ink TUI needs that, and the npx wrapper can interpose a non-TTY pipe.
cd "$DIR/vanta-ts"
if [ -x "node_modules/.bin/tsx" ]; then
  TSX="node_modules/.bin/tsx"
else
  TSX="npx tsx"
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
