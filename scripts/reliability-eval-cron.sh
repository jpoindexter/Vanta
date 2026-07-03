#!/usr/bin/env bash
# launchd/cron wrapper around reliability-eval.sh.
# Runs the bounded reliability battery in launchd's minimal environment, injects
# today's date, and accumulates the dated trend to a PRIVATE, gitignored local file
# (.vanta/ is in .gitignore) — so the readiness number grows past n=1 WITHOUT ever
# touching the public repo (no commit, no push). Review it with:
#   tail -n 40 .vanta/reliability-results.log.md
# On a FAILED or errored run it fires a macOS desktop notification (Notification
# Center) so a silently-broken daily job can't slip by unnoticed. Silent on success.
# Provider/model come from vanta-ts/.env (currently codex / gpt-5.5 — the proven path).
set -uo pipefail

# Self-locate the repo from the script's own path (scripts/ → repo root) — nothing
# hardcoded, so this works from whatever clone the LaunchAgent points at.
REPO="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
cd "$REPO" || exit 1

# launchd starts with a stub PATH — restore the tools the harness needs (node, the
# cargo-built kernel launcher, homebrew, system git) WITHOUT pinning a version or an
# absolute user path: pick nvm's newest node, and add each usual bin dir only if it
# exists, deduped. $HOME-relative throughout.
NVM_NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
for d in "$NVM_NODE_BIN" "$HOME/.cargo/bin" "$HOME/.local/bin" /opt/homebrew/bin /usr/local/bin /usr/bin /bin /usr/sbin /sbin; do
  [ -n "$d" ] && [ -d "$d" ] && case ":$PATH:" in *":$d:"*) ;; *) PATH="$d:$PATH" ;; esac
done
export PATH

mkdir -p "$REPO/.vanta"
LOG="$REPO/.vanta/reliability-cron.log"
DATE="$(date +%F)"

# Accumulate to a gitignored file — private by construction, never committed/pushed.
export VANTA_EVAL_RESULTS="$REPO/.vanta/reliability-results.log.md"

# Desktop ping (a LaunchAgent runs in the user's GUI session, so this posts to
# Notification Center). Best-effort — never let a missing osascript fail the run.
ping_fail() {  # <message>
  /usr/bin/osascript -e "display notification \"$1\" with title \"Vanta reliability\" sound name \"Basso\"" 2>/dev/null || true
}

{
  echo "════ reliability-eval-cron $DATE $(date +%H:%M:%S) ════"
  VANTA_EVAL_DATE="$DATE" bash scripts/reliability-eval.sh
  EVAL_RC=$?
  echo "eval exit=$EVAL_RC → row appended to $VANTA_EVAL_RESULTS"
  # Non-zero = reliability verdict FAIL or the battery couldn't run (env/auth/kernel) —
  # exactly the silent-failure modes worth interrupting for.
  if [ "$EVAL_RC" -ne 0 ]; then
    echo "FAIL/error (rc=$EVAL_RC) — pinging desktop"
    ping_fail "Eval FAILED ${DATE} (rc=${EVAL_RC}). See .vanta/reliability-cron.log"
  fi
  echo "════ done $(date +%H:%M:%S) ════"
} >>"$LOG" 2>&1
