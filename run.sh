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
. "$DIR/scripts/install-events.sh"
vanta_use_vendored_node
if vanta_is_termux; then
  VANTA_PLATFORM="${VANTA_PLATFORM:-termux}"
  ESBUILD_BINARY_PATH="${ESBUILD_BINARY_PATH:-$PREFIX/bin/esbuild}"
  export VANTA_PLATFORM ESBUILD_BINARY_PATH
fi

# --- one-time bootstrap (kernel + node + deps) -------------------------------
vanta_acquire_kernel() {
  if ! vanta_fetch_prebuilt_kernel "$DIR"; then
    if [ "${VANTA_REQUIRE_PREBUILT_KERNEL:-0}" = "1" ]; then
      echo "vanta: prebuilt kernel required but unavailable for this platform/release." >&2
      return 1
    fi
    if vanta_is_termux; then
      vanta_termux_prepare_build || return 1
    fi
    if ! command -v cargo >/dev/null 2>&1; then
      echo "vanta: no prebuilt kernel for this platform and Rust isn't installed." >&2
      echo "  Install Rust (https://rustup.rs) or re-run ./install.sh." >&2
      return 1
    fi
    (cd "$DIR" && cargo build)
  fi
}

vanta_acquire_node() {
  vanta_ensure_node && return 0
  if vanta_is_termux; then
    echo "vanta: Termux Node.js 22+ not found. Run: pkg install nodejs-lts" >&2
  else
    echo "vanta: Node.js 22+ not found and couldn't be downloaded. Install it: https://nodejs.org" >&2
  fi
  return 1
}

vanta_acquire_deps() {
  vanta_install_agent_deps "$DIR/vanta-ts"
}

if [ ! -x "$DIR/target/debug/vanta-kernel" ] || ! vanta_node_ready || [ ! -d "$DIR/vanta-ts/node_modules" ]; then
  VANTA_INSTALL_RETRY_COMMAND="$DIR/run.sh"
  export VANTA_INSTALL_RETRY_COMMAND
  vanta_install_init run.sh "kernel,node,deps"
  [ -x "$DIR/target/debug/vanta-kernel" ] || vanta_install_stage kernel "Acquire safety kernel" vanta_acquire_kernel
  vanta_node_ready || vanta_install_stage node "Acquire Node.js 22+" vanta_acquire_node
  [ -d "$DIR/vanta-ts/node_modules" ] || vanta_install_stage deps "Install agent dependencies" vanta_acquire_deps
  vanta_install_finish
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
if vanta_is_termux; then VANTA_NODE_MAX_DEFAULT=1536; else VANTA_NODE_MAX_DEFAULT=8192; fi
VANTA_HEAP_OPTION="--max-old-space-size=${VANTA_NODE_MAX_MB:-$VANTA_NODE_MAX_DEFAULT}"
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }$VANTA_HEAP_OPTION"

while :; do
  if $TSX src/cli.ts "$@"; then code=0; else code=$?; fi
  [ "$code" = 75 ] || exit "$code"
  echo "vanta: reloading…" >&2
done
