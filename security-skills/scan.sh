#!/usr/bin/env bash
# security-skills/scan.sh — run the whole security-preflight gate on ANY repo, no agent required.
#
#   ./scan.sh [path]          # defaults to the current directory
#
# Runs every scanner you have installed (secrets → dependency CVEs → SAST) and prints a verdict.
# Only SECRETS is a hard fail (unambiguous + irreversible once public); dependency/SAST findings are
# reported for you to triage per the SKILL.md runbooks (reachability before severity, source→sink).
# Install the scanners:  brew install gitleaks osv-scanner cargo-audit semgrep   (npm/cargo as needed)
set -uo pipefail
ROOT="${1:-.}"; cd "$ROOT" || { echo "no such path: $ROOT"; exit 2; }
have() { command -v "$1" >/dev/null 2>&1; }
hardfail=0; missing=()

echo "════════ security-preflight · $(pwd) ════════"

echo; echo "── 1. SECRETS (gitleaks, full history) ──"
if have gitleaks; then
  # gitleaks scans the whole git history and reads the repo's .gitleaks.toml allowlist — so run it
  # from the repo root, not whatever subdir you pointed scan.sh at (else the allowlist is missed).
  glroot="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
  ( cd "$glroot" && gitleaks detect --no-banner --redact ) || { echo "  ✗ SECRETS FOUND — rotate at the provider FIRST, then scrub (see secret-scan/SKILL.md)"; hardfail=1; }
else missing+=(gitleaks); echo "  (skipped — gitleaks not installed)"; fi

echo; echo "── 2. DEPENDENCY CVEs (triage: runtime vs dev) ──"
[ -f package.json ] && have npm        && { echo "· npm audit (runtime only):"; npm audit --omit=dev || true; }
[ -f Cargo.lock ]   && have cargo-audit && { echo "· cargo audit:"; cargo audit || true; }
if have osv-scanner; then echo "· osv-scanner (all lockfiles, labels dev):"; osv-scanner scan source --recursive . || true
else missing+=(osv-scanner); echo "  (osv-scanner not installed — the most complete dep scanner)"; fi

echo; echo "── 3. SAST (semgrep, your own code) ──"
if have semgrep; then semgrep scan --config p/security-audit --config p/secrets --metrics=off . || true
else missing+=(semgrep); echo "  (skipped — semgrep not installed)"; fi

echo; echo "════════ verdict ════════"
[ ${#missing[@]} -gt 0 ] && echo "scanners missing: ${missing[*]}  →  brew install ${missing[*]}"
if [ "$hardfail" = 0 ]; then
  echo "✓ no hard fail. Triage the dependency/SAST notes above per the SKILL.md runbooks before you ship."
else
  echo "✗ BLOCKED on secrets — do not push/publish until rotated + scrubbed."
fi
exit "$hardfail"
