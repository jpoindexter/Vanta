#!/bin/sh
# Real-PTY terminal-grid regression for TUI-RESIZE-GHOST-REGRESSION.
# Exercises width-only, height-only, combined, and rapid alternating resizes in
# idle and streaming states. Every visible-grid capture must contain one intact
# composer, one footer, and (while streaming) one active-run marker.
set -eu
cd "$(dirname "$0")/.."

STAMP=$(date +%Y%m%d-%H%M%S)
CAPTURE_DIR=${CAPTURE_DIR:-".artifacts/tui-resize-ghost/$STAMP"}
COMMAND=${VANTA_RESIZE_COMMAND:-"node --import tsx scripts/ghost-repro.tsx"}
SHOW=${1:-}
mkdir -p "$CAPTURE_DIR"

session=""
cleanup() {
  if [ -n "$session" ]; then tmux kill-session -t "$session" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

count() {
  pattern=$1
  file=$2
  grep -c "$pattern" "$file" 2>/dev/null || true
}

assert_capture() {
  file=$1
  mode=$2
  top=$(count '^╭' "$file")
  bottom=$(count '^╰' "$file")
  draft=$(count 'RESIZE_PROOF_DRAFT' "$file")
  footer=$(count '/ commands.*@ files.*! shell.*# memory' "$file")
  active=$(count 'RESIZE_ACTIVE_RUN' "$file")
  if [ "$top" -ne 1 ] || [ "$bottom" -ne 1 ] || [ "$draft" -ne 1 ] || [ "$footer" -ne 1 ]; then
    echo "invalid terminal grid: $file (top=$top bottom=$bottom draft=$draft footer=$footer)"
    sed -n '1,80p' "$file"
    exit 1
  fi
  if [ "$mode" = "streaming" ] && [ "$active" -ne 1 ]; then
    echo "active run lost or duplicated: $file (active=$active)"
    sed -n '1,80p' "$file"
    exit 1
  fi
}

capture() {
  label=$1
  mode=$2
  file="$CAPTURE_DIR/$mode-$label.txt"
  tmux capture-pane -t "$session" -p > "$file"
  assert_capture "$file" "$mode"
}

resize_and_capture() {
  label=$1
  width=$2
  height=$3
  mode=$4
  tmux resize-window -t "$session" -x "$width" -y "$height"
  sleep 0.18
  capture "$label-${width}x${height}" "$mode"
}

run_mode() {
  mode=$1
  session="vanta-resize-$mode-$$"
  tmux new-session -d -s "$session" -x 100 -y 30 "PROOF_MODE=$mode ENTRIES=1 $COMMAND"

  ready=0
  i=0
  while [ "$i" -lt 120 ]; do
    if tmux capture-pane -t "$session" -p 2>/dev/null | grep -q "Ask Vanta"; then ready=1; break; fi
    if ! tmux has-session -t "$session" 2>/dev/null; then break; fi
    sleep 0.25
    i=$((i + 1))
  done
  if [ "$ready" -ne 1 ]; then
    echo "resize harness did not become ready ($mode)"
    tmux capture-pane -t "$session" -p -S -100 2>/dev/null || true
    exit 1
  fi

  tmux send-keys -t "$session" -l "RESIZE_PROOF_DRAFT"
  sleep 0.18
  capture "before-100x30" "$mode"

  resize_and_capture "width-only" 60 30 "$mode"
  resize_and_capture "height-only" 60 20 "$mode"
  resize_and_capture "width-only" 78 20 "$mode"
  resize_and_capture "height-only" 78 25 "$mode"
  resize_and_capture "width-only" 100 25 "$mode"
  resize_and_capture "height-only" 100 30 "$mode"
  resize_and_capture "grow" 140 45 "$mode"

  # Rapid alternating changes are intentionally not allowed to settle until the
  # final 78x25 grid; the deferred repaint must coalesce to that final geometry.
  tmux resize-window -t "$session" -x 60 -y 20
  tmux resize-window -t "$session" -x 140 -y 45
  tmux resize-window -t "$session" -x 78 -y 25
  sleep 0.18
  capture "rapid-final-78x25" "$mode"

  tmux kill-session -t "$session" 2>/dev/null || true
  session=""
}

run_mode idle
run_mode streaming

echo "tui-resize-ghost: PASS"
echo "captures: $CAPTURE_DIR"
if [ "$SHOW" = "show" ]; then
  sed -n '1,80p' "$CAPTURE_DIR/streaming-rapid-final-78x25.txt"
fi
