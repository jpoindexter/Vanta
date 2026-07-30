#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_SKILLS_DIR="${CODEX_SKILLS_DIR:-${CODEX_HOME:-$HOME/.codex}/skills}"
CLAUDE_SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
CLAUDE_COMMANDS_DIR="${CLAUDE_COMMANDS_DIR:-$HOME/.claude/commands}"

install_skills() {
  local destination="$1"
  mkdir -p "$destination"
  for skill in "$ROOT"/skills/*; do
    local name
    name="$(basename "$skill")"
    rm -rf "$destination/$name"
    cp -R "$skill" "$destination/$name"
  done
  mkdir -p "$destination/reward-safety/scripts"
  cp "$ROOT/scripts/route.mjs" "$destination/reward-safety/scripts/route.mjs"
  cp "$ROOT/scripts/contrastive-gap.mjs" \
    "$destination/reward-safety/scripts/contrastive-gap.mjs"
}

install_skills "$CODEX_SKILLS_DIR"
install_skills "$CLAUDE_SKILLS_DIR"
mkdir -p "$CLAUDE_COMMANDS_DIR"
cp "$ROOT/commands/reward-safety.md" "$CLAUDE_COMMANDS_DIR/reward-safety.md"

printf 'Installed reward-safety skills to:\n- %s\n- %s\n' \
  "$CODEX_SKILLS_DIR" "$CLAUDE_SKILLS_DIR"
printf 'Installed /reward-safety command to:\n- %s\n' "$CLAUDE_COMMANDS_DIR"
