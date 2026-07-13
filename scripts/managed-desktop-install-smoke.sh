#!/usr/bin/env bash
# Full managed desktop proof. It packages Vanta from a fresh managed checkout,
# then drives the resulting Electron artifact through the session UI smoke.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="$(git -C "$REPO_ROOT" branch --show-current)"
TMP_ROOT="$(cd "$(mktemp -d "${TMPDIR:-/tmp}/vanta-managed-desktop.XXXXXX")" && pwd -P)"
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

# The bootstrap clones HEAD. Overlay the current candidate so this proof also
# covers uncommitted installer/package changes without mutating the source tree.
git -C "$REPO_ROOT" diff --binary HEAD | git -C "$VANTA_HOME/app" apply
while IFS= read -r -d '' path; do
  mkdir -p "$(dirname "$VANTA_HOME/app/$path")"
  cp -R "$REPO_ROOT/$path" "$VANTA_HOME/app/$path"
done < <(git -C "$REPO_ROOT" ls-files --others --exclude-standard -z)

VANTA_DESKTOP_NO_OPEN=1 bash "$REPO_ROOT/scripts/bootstrap-install.sh" \
  --repo "$REPO_ROOT" \
  --branch "$BRANCH" \
  --dir "$VANTA_HOME/app" \
  --vanta-home "$VANTA_HOME" \
  --non-interactive \
  --desktop

APP="$VANTA_HOME/app/vanta-ts/release/mac-arm64/Vanta.app/Contents/MacOS/Vanta"
test -x "$APP"
(cd "$VANTA_HOME/app/vanta-ts" && VANTA_DESKTOP_APP="$APP" npm run desktop:sessions:smoke)
printf 'managed desktop installer smoke: packaged app and session controls ready\n'
