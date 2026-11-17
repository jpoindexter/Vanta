#!/usr/bin/env bash
# Snapshot every claude/desktop-* branch and every worktree's uncommitted work.
# Output: <dest>/<timestamp>/{branches.bundle, <worktree>.patch, <worktree>-untracked.tar.gz, manifest.txt}
set -euo pipefail
repo="${1:-$(git rev-parse --show-toplevel)}"
dest="${2:-$HOME/Documents/GitHub/docs/_backups/vanta-desktop}"
keep="${KEEP:-12}"
stamp="$(date +%Y%m%d-%H%M%S)"
out="$dest/$stamp"
mkdir -p "$out"
cd "$repo"
branches=$(git for-each-ref --format='%(refname)' 'refs/heads/claude/desktop-*')
# shellcheck disable=SC2086
git bundle create "$out/branches.bundle" $branches >/dev/null
{
  echo "created $stamp"
  git for-each-ref --format='%(refname:short) %(objectname:short)' 'refs/heads/claude/desktop-*'
} > "$out/manifest.txt"
git worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r wt; do
  name="$(basename "$wt")"
  [ -d "$wt" ] || continue
  branch="$(git -C "$wt" branch --show-current 2>/dev/null || true)"
  case "$branch" in claude/desktop-*) ;; *) continue ;; esac
  git -C "$wt" diff HEAD --binary > "$out/$name.patch" || true
  untracked="$(git -C "$wt" ls-files --others --exclude-standard)"
  if [ -n "$untracked" ]; then
    printf '%s\n' "$untracked" | tar -czf "$out/$name-untracked.tar.gz" -C "$wt" -T - 2>/dev/null || true
  fi
  echo "$name $branch dirty=$(git -C "$wt" status --short | wc -l | tr -d ' ')" >> "$out/manifest.txt"
done
ls -1dt "$dest"/*/ 2>/dev/null | tail -n +$((keep + 1)) | xargs -I{} rm -rf {} 2>/dev/null || true
echo "backup written: $out"
