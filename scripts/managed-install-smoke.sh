#!/usr/bin/env bash
# End-to-end managed installer proof. Uses a temporary HOME so it cannot change
# the operator's existing global launcher, Vanta state, or source checkout.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="$(git -C "$REPO_ROOT" branch --show-current)"
TMP_ROOT="$(cd "$(mktemp -d "${TMPDIR:-/tmp}/vanta-managed-install.XXXXXX")" && pwd -P)"
HOME="$TMP_ROOT/home"
VANTA_HOME="$HOME/.vanta"
export HOME VANTA_HOME
trap 'rm -rf "$TMP_ROOT"' EXIT

bash "$REPO_ROOT/scripts/bootstrap-install.sh" \
  --repo "$REPO_ROOT" \
  --branch "$BRANCH" \
  --dir "$VANTA_HOME/app" \
  --vanta-home "$VANTA_HOME" \
  --non-interactive

test -x "$HOME/.local/bin/vanta"
test -f "$VANTA_HOME/repo-path"
test "$(cat "$VANTA_HOME/repo-path")" = "$VANTA_HOME/app"
VANTA_HOME="$VANTA_HOME" "$HOME/.local/bin/vanta" --help
printf 'managed installer smoke: global launcher and isolated runtime ready\n'
