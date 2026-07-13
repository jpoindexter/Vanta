#!/usr/bin/env bash
# Vanta managed-runtime bootstrap.
#
# Safe public entrypoint for `curl -fsSL .../install.sh | bash`. It obtains a
# dedicated checkout under VANTA_HOME, then delegates to the checkout's normal
# installer so Node/kernel verification and the global launcher have one owner.

set -euo pipefail

REPO_URL="${VANTA_REPO_URL:-https://github.com/jpoindexter/Vanta.git}"
VANTA_HOME="${VANTA_HOME:-$HOME/.vanta}"
INSTALL_DIR="${VANTA_INSTALL_DIR:-$VANTA_HOME/app}"
BRANCH="${VANTA_BRANCH:-main}"
RUN_SETUP=true
BUILD_DESKTOP=false
NONINTERACTIVE=false

usage() {
  cat <<'EOF'
Vanta managed-runtime installer

Usage: install.sh [options]

  --dir PATH          Managed runtime directory (default: $VANTA_HOME/app)
  --vanta-home PATH   Vanta data/config directory (default: ~/.vanta)
  --branch NAME       Git branch to install (default: main)
  --repo URL          Git repository URL (default: official Vanta repository)
  --desktop           Build and launch the Electron desktop app after install
  --skip-setup        Do not open the interactive provider setup
  --non-interactive   Never prompt; implies --skip-setup
  -h, --help          Show this help
EOF
}

log() { printf 'vanta: %s\n' "$*"; }
fail() { printf 'vanta: error: %s\n' "$*" >&2; exit 1; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --vanta-home) VANTA_HOME="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --repo) REPO_URL="${2:-}"; shift 2 ;;
    --desktop) BUILD_DESKTOP=true; shift ;;
    --skip-setup) RUN_SETUP=false; shift ;;
    --non-interactive) NONINTERACTIVE=true; RUN_SETUP=false; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown option: $1 (run with --help)" ;;
  esac
done

[ -n "$INSTALL_DIR" ] || fail "--dir needs a path"
[ -n "$VANTA_HOME" ] || fail "--vanta-home needs a path"
[ -n "$BRANCH" ] || fail "--branch needs a name"
[ -n "$REPO_URL" ] || fail "--repo needs a URL"

command -v git >/dev/null 2>&1 || fail "git is required; install it from https://git-scm.com/downloads"
mkdir -p "$VANTA_HOME"

if [ -e "$INSTALL_DIR" ] && [ ! -d "$INSTALL_DIR/.git" ]; then
  fail "$INSTALL_DIR exists but is not a managed Vanta git checkout; choose another --dir"
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  if [ -n "$(git -C "$INSTALL_DIR" status --porcelain)" ]; then
    log "managed runtime has local changes; leaving its checkout untouched"
  else
    log "updating managed runtime ($BRANCH)"
    git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout --force "$BRANCH"
    git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
  fi
else
  parent="$(dirname "$INSTALL_DIR")"
  mkdir -p "$parent"
  temp_dir="$(mktemp -d "$parent/.vanta-install.XXXXXX")"
  trap 'rm -rf "$temp_dir"' EXIT
  log "cloning managed runtime ($BRANCH)"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$temp_dir/app"
  mv "$temp_dir/app" "$INSTALL_DIR"
  rmdir "$temp_dir" 2>/dev/null || true
  trap - EXIT
fi

log "provisioning runtime at $INSTALL_DIR"
(cd "$INSTALL_DIR" && VANTA_HOME="$VANTA_HOME" VANTA_INSTALL_NONINTERACTIVE="$([ "$NONINTERACTIVE" = true ] && printf 1 || printf 0)" ./install.sh)

if [ "$RUN_SETUP" = true ]; then
  log "opening provider setup"
  VANTA_HOME="$VANTA_HOME" "$INSTALL_DIR/run.sh" setup
fi

if [ "$BUILD_DESKTOP" = true ]; then
  log "building desktop app from the managed runtime"
  (cd "$INSTALL_DIR/vanta-ts" && npm install && npm run desktop:pack)
  app_path="$INSTALL_DIR/vanta-ts/release/mac-arm64/Vanta.app"
  if [ "$(uname -s)" = Darwin ] && [ -d "$app_path" ] && [ "${VANTA_DESKTOP_NO_OPEN:-0}" != "1" ]; then
    open "$app_path"
  else
    log "desktop artifact built under $INSTALL_DIR/vanta-ts/release"
  fi
fi

log "managed install ready"
