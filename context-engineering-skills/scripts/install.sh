#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VANTA_SKILLS_DIR="${VANTA_SKILLS_DIR:-${VANTA_HOME:-$HOME/.vanta}/skills}"
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
}

install_skills "$VANTA_SKILLS_DIR"
install_skills "$CODEX_SKILLS_DIR"
install_skills "$CLAUDE_SKILLS_DIR"
mkdir -p "$CLAUDE_COMMANDS_DIR"
cp "$ROOT/commands/context-doctor.md" "$CLAUDE_COMMANDS_DIR/context-doctor.md"

printf 'Installed context-engineering skills to:\n- %s\n- %s\n- %s\n' \
  "$VANTA_SKILLS_DIR" "$CODEX_SKILLS_DIR" "$CLAUDE_SKILLS_DIR"
printf 'Installed /context-doctor command to:\n- %s\n' "$CLAUDE_COMMANDS_DIR"
