#!/bin/sh
# Reproduce inline-render ghosting via a tmux resize storm (both directions).
# Counts how many composer boxes survive on the final captured screen — should be 1.
set -e
cd "$(dirname "$0")/.."
SES=ghoststorm
SHOW="${1:-}"
tmux kill-session -t "$SES" 2>/dev/null || true
tmux new-session -d -s "$SES" -x 100 -y 30 "node --import tsx scripts/ghost-repro.tsx"
# Loading the real component graph can take several seconds on a cold cache.
# Start the storm only after the composer is actually present.
READY=0
I=0
while [ "$I" -lt 80 ]; do
  if tmux capture-pane -t "$SES" -p 2>/dev/null | grep -q "Ask Vanta"; then
    READY=1
    break
  fi
  if ! tmux has-session -t "$SES" 2>/dev/null; then break; fi
  sleep 0.25
  I=$((I + 1))
done
if [ "$READY" -ne 1 ]; then
  echo "ghost harness did not become ready"
  tmux capture-pane -t "$SES" -p -S -100 2>/dev/null || true
  tmux kill-session -t "$SES" 2>/dev/null || true
  exit 1
fi
# Harsh storm: rapid grow/shrink, wide swings, tight timing (the documented trigger).
for w in 81 130 70 125 65 120 95 60 135 75 110 85 100 64 132 100; do
  tmux resize-window -t "$SES" -x "$w" -y 30 2>/dev/null || true
  sleep 0.08
done
sleep 0.5
if [ "$SHOW" = "show" ]; then
  echo "=== FINAL SCREEN (width 100) ==="
  tmux capture-pane -t "$SES" -p
  echo "=== END ==="
fi
N=$(tmux capture-pane -t "$SES" -p | grep -c "Ask Vanta" || true)
echo "composer-boxes-on-screen: $N (expected 1)"
tmux kill-session -t "$SES" 2>/dev/null || true
[ "$N" -eq 1 ]
