#!/usr/bin/env bash
# VANTA RELIABILITY — REACH-CHANNEL STALENESS (deterministic fault injection, no live deps).
# The reliability batteries drive real one-shot tasks, but the staleness class (a rotated
# external query id / stale credential — the bug behind REACH-X-SEARCH-STALE-QID) can't be
# exercised against live X reproducibly. So this harness injects the fault into the REAL
# searchTwitter() wiring with a stubbed fetch + a seeded STALE query id and asserts the two
# outcomes the channel must guarantee: it AUTO-HEALS + retries to a real result, or it
# DEGRADES GRACEFULLY with actionable guidance — never a wedge, never a fake success.
# Deterministic (fixture-based) → safe to run in the battery on every provider, no cookie.
# Usage: scripts/reliability-reach-staleness.sh
set -uo pipefail
cd "$(dirname "$0")/.."
TIMEOUT="${STALENESS_TIMEOUT_SEC:-60}"

out="$(mktemp)"; start=$SECONDS
( cd vanta-ts && node --import tsx scripts/reach-staleness-scenario.ts ) >"$out" 2>&1 &
pid=$!
until ! kill -0 "$pid" 2>/dev/null || [ $((SECONDS - start)) -gt "$TIMEOUT" ]; do sleep 1; done
if kill -0 "$pid" 2>/dev/null; then                      # never terminated → the wedge class itself
  kill "$pid" 2>/dev/null
  echo "── reach staleness → HANG (never terminated in ${TIMEOUT}s) ──"
  cat "$out"; rm -f "$out"
  echo "VERDICT: FAIL — scenario wedged"; exit 1
fi
wait "$pid"; code=$?; dur=$((SECONDS - start))

echo "── reach-channel staleness (deterministic, no live X) → exit=$code wall=${dur}s ──"
cat "$out"; rm -f "$out"
[ "$code" = "0" ] && echo "── clean exit in ${dur}s ──" \
                  || { echo "VERDICT: FAIL (exit=$code)"; exit 1; }
