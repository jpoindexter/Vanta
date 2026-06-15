#!/bin/sh
# Inspect vertical-resize behavior: does content stay anchored / is there a stray
# bar? Start short, then make the window TALL (height-only change), capture.
set -e
cd "$(dirname "$0")/.."
SES=ghosttall
tmux kill-session -t "$SES" 2>/dev/null || true
tmux new-session -d -s "$SES" -x 80 -y 24 "node_modules/.bin/tsx scripts/ghost-repro.tsx"
sleep 2
echo "=== AT 80x24 ==="
tmux capture-pane -t "$SES" -p | cat -e | sed -n '1,30p'
# Height-only resize (width unchanged) — pull the window taller.
tmux resize-window -t "$SES" -x 80 -y 49 2>/dev/null || true
sleep 0.6
echo ""
echo "=== AFTER height-only resize to 80x49 (showing all 49 rows, \$=line end) ==="
tmux capture-pane -t "$SES" -p | cat -e
tmux kill-session -t "$SES" 2>/dev/null || true
