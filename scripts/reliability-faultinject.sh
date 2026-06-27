#!/usr/bin/env bash
# VANTA PROVIDER-HARDENING — LIVE FAULT INJECTION. Forces a REAL provider timeout (a tiny
# VANTA_PROVIDER_TIMEOUT_SEC makes a genuine codex call exceed the idle/request window) and asserts
# the hardening chain fires on the real path — codex idle-timeout ABORTS the stalled stream, the
# bounded transient-retry RETRIES it, and the run STOPS GRACEFULLY (clean exit + honest error)
# instead of hanging to the harness ceiling or crashing exit=1. Proves the fixes against a live
# failure, not just mocked stalls. (Codex-provider specific; needs codex/.env configured.)
set -uo pipefail
cd "$(dirname "$0")/.."
TO="${FAULT_TIMEOUT_SEC:-1}"; RETRIES="${FAULT_RETRIES:-2}"
out="$(mktemp)"; start=$SECONDS
VANTA_PROVIDER_TIMEOUT_SEC="$TO" VANTA_PROVIDER_RETRIES="$RETRIES" VANTA_PROVIDER_RETRY_BACKOFF_MS=0 \
  ./run.sh run "reason carefully step by step about whether 17 is prime, then reply yes or no" >"$out" 2>&1
code=$?; dur=$((SECONDS - start))
echo "── live fault-inject (timeout=${TO}s retries=${RETRIES}) → exit=$code wall=${dur}s ──"
ok=1
grep -qi  "provider timeout"        "$out" || { echo "FAIL: codex idle-timeout did not fire"; ok=0; }
grep -qiE "after $((RETRIES + 1)) attempt" "$out" || { echo "FAIL: transient-retry did not run $((RETRIES + 1)) attempts"; ok=0; }
[ "$code" = "0" ]                          || { echo "FAIL: not a graceful exit (exit=$code = crash, not clean stop)"; ok=0; }
[ "$dur" -lt 60 ]                          || { echo "FAIL: ${dur}s — looks like a hang, not a bounded abort"; ok=0; }
echo "── evidence ──"; grep -iE "provider timeout|Stopped: provider error|attempt" "$out" | head -2
rm -f "$out"
[ "$ok" = 1 ] && echo "VERDICT: PASS — live: codex timeout fired, retried $((RETRIES + 1))×, graceful stop in ${dur}s (no hang, no crash)" \
             || { echo "VERDICT: FAIL"; exit 1; }
