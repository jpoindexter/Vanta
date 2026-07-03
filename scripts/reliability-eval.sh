#!/usr/bin/env bash
# VANTA RELIABILITY EVAL — the tracked scored eval (the measurement half of AHE-EVAL-HARNESS).
# Runs a BOUNDED reliability battery, parses each harness's reliability pass-rate (the readiness
# bar), and appends ONE dated record to docs/reliability-results.md so the number is tracked over
# time instead of asserted once. Reliability (terminates / clean exit / no zombie / survives load)
# is the gate; per-harness task-success is recorded too but does not gate (it tracks model quality).
#
# Usage:  scripts/reliability-eval.sh                 # bounded default battery on the active provider
#         VANTA_PROVIDER=ollama VANTA_MODEL=qwen2.5:14b scripts/reliability-eval.sh
set -uo pipefail
cd "$(dirname "$0")/.."
DATE="${VANTA_EVAL_DATE:-unset}"                 # inject a date for a deterministic record line
# Resolve the provider name for the record: explicit env, else the one the harnesses will use
# (vanta-ts/.env's VANTA_PROVIDER), else unknown.
PROVIDER="${VANTA_PROVIDER:-$(grep -E '^VANTA_PROVIDER=' vanta-ts/.env 2>/dev/null | head -1 | cut -d= -f2)}"
PROVIDER="${PROVIDER:-unknown}"
RESULTS="${VANTA_EVAL_RESULTS:-docs/reliability-results.md}"   # override to a private/gitignored path for scheduled runs

# Each row: label ::: command. Bounded so the eval is runnable regularly (not the full soak).
run_one() {  # <label> <cmd...> → "label|reliability%|verdict"
  local label="$1"; shift
  local out; out="$(mktemp)"
  "$@" >"$out" 2>&1 || true
  # smoke prints "PASS=n FAIL=m"; stress/longrun print "RELIABLE=n (P%)" + "VERDICT: X"
  local rel verdict
  rel="$(grep -oE 'RELIABLE=[0-9]+ \([0-9.]+%\)' "$out" | grep -oE '[0-9.]+%' | head -1)"
  if [ -z "$rel" ]; then  # smoke: derive % from PASS/FAIL
    local p f; p="$(grep -oE 'PASS=[0-9]+' "$out" | grep -oE '[0-9]+' | head -1)"; f="$(grep -oE 'FAIL=[0-9]+' "$out" | grep -oE '[0-9]+' | head -1)"
    [ -n "${p:-}" ] && rel="$(awk -v p="$p" -v f="${f:-0}" 'BEGIN{t=p+f; printf "%.1f%%", t?100*p/t:0}')"
  fi
  verdict="$(grep -oE 'VERDICT: [A-Z]+' "$out" | head -1 | grep -oE '[A-Z]+$')"
  [ -z "$verdict" ] && verdict="$(grep -q 'FAIL=0' "$out" && echo PASS || echo FAIL)"
  echo "${label}|${rel:-?}|${verdict:-?}"
  rm -f "$out"
}

echo "── VANTA RELIABILITY EVAL ── provider=${PROVIDER} date=${DATE} ──"
declare -a ROWS=()
ROWS+=("$(run_one smoke   bash scripts/reliability-smoke.sh)")
ROWS+=("$(run_one stress  env K=1 STRESS_CONCURRENCY=4 bash scripts/reliability-stress.sh 5)")
ROWS+=("$(run_one longrun env N=2 bash scripts/reliability-longrun.sh)")

# Print + assemble the markdown record row.
printf '%-9s %-12s %s\n' HARNESS RELIABILITY VERDICT
cells=""; allpass=1
for r in "${ROWS[@]}"; do
  label="${r%%|*}"; rest="${r#*|}"; rel="${rest%%|*}"; verdict="${rest##*|}"
  printf '%-9s %-12s %s\n' "$label" "$rel" "$verdict"
  cells="${cells} ${label} ${rel} (${verdict}) ·"
  [ "$verdict" != "PASS" ] && allpass=0
done
overall=$([ "$allpass" = "1" ] && echo PASS || echo FAIL)

# Append a dated record so reliability is tracked over time. Create the file with a header once.
if [ ! -f "$RESULTS" ]; then
  printf '# Reliability eval — tracked pass-rate over time\n\nReliability = terminates / clean exit / no zombie / survives load (the readiness bar). One row per `scripts/reliability-eval.sh` run.\n\n| Date | Provider | Overall | Per-harness reliability |\n|------|----------|---------|--------------------------|\n' > "$RESULTS"
fi
row="${cells% ·}"; row="${row# }"
printf '| %s | %s | %s | %s |\n' "$DATE" "$PROVIDER" "$overall" "$row" >> "$RESULTS"

echo "──────────────────────────────────────────────"
echo "OVERALL: ${overall}  → recorded to ${RESULTS} (date=${DATE})"
[ "$overall" = "PASS" ]
