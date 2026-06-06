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

# --- prerequisites -----------------------------------------------------------
if ! command -v cargo >/dev/null 2>&1; then
  echo "vanta: Rust toolchain not found. Install it: https://rustup.rs" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "vanta: Node.js not found (need 22+). Install it: https://nodejs.org" >&2
  exit 1
fi

# --- one-time bootstrap ------------------------------------------------------
if [ ! -x "$DIR/target/debug/vanta-kernel" ]; then
  echo "vanta: building the safety kernel (first run only)…" >&2
  (cd "$DIR" && cargo build)
fi
if [ ! -d "$DIR/vanta-ts/node_modules" ]; then
  echo "vanta: installing agent dependencies (first run only)…" >&2
  (cd "$DIR/vanta-ts" && npm install)
fi

# --- launch (cli.ts finds the repo root from its own path; cwd is irrelevant) -
# Use the local tsx binary directly (not `npx`) so stdin/stdout stay a real TTY —
# the Ink TUI needs that, and the npx wrapper can interpose a non-TTY pipe.
cd "$DIR/vanta-ts"
if [ -x "node_modules/.bin/tsx" ]; then
  exec node_modules/.bin/tsx src/cli.ts "$@"
else
  exec npx tsx src/cli.ts "$@"
fi
