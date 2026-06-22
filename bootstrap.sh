#!/bin/bash
# ============================================================================
# Vanta bootstrap installer — one command on a fresh machine.
# Clones (or updates) Vanta, then runs install.sh (builds the Rust kernel +
# agent deps, installs the global `vanta` command into ~/.local/bin).
#
#   curl -fsSL https://raw.githubusercontent.com/jpoindexter/Vanta/main/bootstrap.sh | bash
#
# While the repo is PRIVATE the clone uses your GitHub git auth (SSH key, gh, or
# a credential helper); the curl one-liner above works once the repo is public.
# Installs to ~/vanta. Override with:
#   VANTA_DIR=/path/to/Vanta bash bootstrap.sh
# Idempotent — re-run any time; it fast-forward-updates an existing checkout.
# ============================================================================
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
REPO="${VANTA_REPO:-https://github.com/jpoindexter/Vanta.git}"
DIR="${VANTA_DIR:-$HOME/vanta}"

echo ""
echo -e "${CYAN}⚓ Vanta bootstrap${NC}"

# --- prerequisites ----------------------------------------------------------
# Only git is required up front. install.sh provides the rest with no toolchain:
# it downloads a prebuilt kernel (no Rust) and a portable Node 22 (no system Node)
# when they're missing — both checksum-verified.
command -v git >/dev/null 2>&1 || { echo -e "${RED}✗${NC} git not found — install it first"; exit 1; }

# --- clone or update --------------------------------------------------------
if [ -d "$DIR/.git" ]; then
  echo -e "${CYAN}→${NC} updating existing checkout at $DIR"
  git -C "$DIR" pull --ff-only
else
  echo -e "${CYAN}→${NC} cloning Vanta into $DIR"
  mkdir -p "$(dirname "$DIR")"
  git clone "$REPO" "$DIR"
fi
echo -e "${GREEN}✓${NC} source ready at $DIR"

# --- hand off to the repo's installer ---------------------------------------
exec "$DIR/install.sh"
