#!/usr/bin/env bash
# VANTA RELIABILITY — LONG AUTONOMOUS RUN.  The Pillar-1 keystone test
# (RELIABILITY-LONG-RUN-PROOF): every other reliability test is a short one-shot, but the
# actual bar is "a LONG autonomous run finishes verified work without babysitting." This drives
# ONE big multi-stage task (find → read x5 → synthesize → write artifact → read back → lint →
# summarize: ~10-15 tool calls, must hold state across stages) unattended N times and scores:
#
#   RELIABLE  = terminated / clean exit / no zombie (the bar).
#   COMPLETED = the run actually produced the artifact end-to-end (the report file exists and
#               holds the 5-row table) — proof it didn't drift or false-"done" partway.
#
# Exit keys on RELIABILITY (the bar). Usage: N=5 scripts/reliability-longrun.sh
set -uo pipefail
cd "$(dirname "$0")/.."
N="${N:-5}"
TIMEOUT="${VANTA_LONGRUN_TIMEOUT:-600}"     # a long run gets a long ceiling
THRESHOLD="${LONGRUN_THRESHOLD:-90}"
ART="/tmp/vanta-longrun-audit.md"
# The agent's scratch artifact lives in /tmp — make it an in-scope readable/writable zone so the
# unattended run can read it back without hitting an out-of-scope approval wall (a real unattended
# deployment configures the agent's working area the same way). Without this, read_file on /tmp is
# refused with no human to approve, which derails the task non-deterministically.
export VANTA_WRITABLE_DIRS="${VANTA_WRITABLE_DIRS:-/tmp}"
export VANTA_READABLE_DIRS="${VANTA_READABLE_DIRS:-/tmp}"

TASK="You are auditing the Vanta TypeScript codebase. Do ALL of the following in order and do \
not stop until every step is done. 1) Find the 5 largest TypeScript files under vanta-ts/src \
excluding test files (by line count). 2) For EACH of those 5 files, read it and determine its \
line count and how many exported functions it declares. 3) Write a GitHub-markdown table with \
columns File, Lines, Exports — one row per file, all 5 rows — to ${ART}. 4) Read ${ART} back to \
confirm it was written correctly. 5) Run this shell command and capture whether it passes: \
cd vanta-ts && npx tsx src/cli.ts lint <the single largest file from step 1>. 6) Give a final \
one-paragraph summary naming the largest file, its export count, and the size-gate lint result."

run_one() {  # → "RELIABLE|UNRELIABLE <reason> <dur>"; writes log to $1
  local out="$1" pid start dur code
  ( ./run.sh run "$TASK" >"$out" 2>&1; echo "[[EXIT $?]]" >>"$out" ) &
  pid=$!; start=$SECONDS
  until grep -q '\[\[EXIT' "$out" 2>/dev/null || [ $((SECONDS - start)) -gt "$TIMEOUT" ]; do sleep 3; done
  dur=$((SECONDS - start))
  if ! grep -q '\[\[EXIT' "$out"; then kill "$pid" 2>/dev/null; pkill -f 'cli.ts run' 2>/dev/null; echo "UNRELIABLE hang ${dur}"; return; fi
  code="$(grep -oE '\[\[EXIT [0-9]+' "$out" | grep -oE '[0-9]+')"
  [ "$code" != "0" ] && { echo "UNRELIABLE exit=$code ${dur}"; return; }
  echo "RELIABLE ok ${dur}"
}
pct() { awk -v n="$1" -v d="$2" 'BEGIN{ if(d==0){print "0.0"}else{printf "%.1f", 100*n/d} }'; }

echo "── VANTA LONG AUTONOMOUS RUN ── provider=${VANTA_PROVIDER:-<.env>} N=${N} timeout=${TIMEOUT}s ──"
echo "── warming provider (untimed) ──"; ./run.sh run "reply with the word ready only" >/dev/null 2>&1 || true
printf '%-5s %-9s %-10s %-7s %s\n' RUN RELIAB COMPLETED TIME NOTE
declare -i RELIABLE=0 COMPLETED=0 HANGS=0 BADEXIT=0 EXECUTED=0
for ((r = 1; r <= N; r++)); do
  EXECUTED+=1
  out="$(mktemp)"; rm -f "$ART"
  read -r verdict reason dur <<<"$(run_one "$out")"
  rel="no"; comp="no"; note=""
  if [ "$verdict" = "RELIABLE" ]; then
    rel="yes"; RELIABLE+=1
    sleep 1; z="$(pgrep -f 'cli.ts run' | wc -l | tr -d ' ')"; [ "$z" != "0" ] && note="zombie "
    # COMPLETED = the artifact exists AND holds at least 4 .ts data rows (proof it ran end-to-end)
    if [ -f "$ART" ] && [ "$(grep -c '\.ts' "$ART" 2>/dev/null)" -ge 4 ]; then comp="yes"; COMPLETED+=1; else note="${note}artifact-missing "; fi
  else
    case "$reason" in hang) HANGS+=1; note="HANG ";; exit=*) BADEXIT+=1; note="${reason} ";; esac
  fi
  col=32; [ "$rel" = "no" ] && col=31
  printf '%-5s \033[%sm%-9s\033[0m %-10s %ss     %s\n' "$r" "$col" "$rel" "$comp" "$dur" "${note:-clean}"
  # Keep failing/incomplete logs — you can't diagnose what you discard (and the hill-climb needs them).
  if [ "$rel" = "yes" ] && [ "$comp" = "yes" ]; then
    rm -f "$out"
  else
    fail="/tmp/vanta-longrun-fail-${r}.log"; mv "$out" "$fail"; echo "      ↳ kept failing log: $fail"
    # STOP_ON_FAIL: for diagnosis — halt at the first captured failure so the log is fresh.
    [ -n "${STOP_ON_FAIL:-}" ] && { echo "── STOP_ON_FAIL: caught a failure at run $r ──"; break; }
  fi
done
rm -f "$ART"
echo "──────────────────────────────────────────────"
OREL="$(pct "$RELIABLE" "$EXECUTED")"; OCOMP="$(pct "$COMPLETED" "$EXECUTED")"
echo "RUNS=$EXECUTED  RELIABLE=${RELIABLE} (${OREL}%)  COMPLETED=${COMPLETED} (${OCOMP}%)"
echo "failure modes → hangs=$HANGS bad-exit=$BADEXIT"
echo "lingering run procs: $(pgrep -f 'cli.ts run' | wc -l | tr -d ' ')"
awk -v r="$OREL" -v t="$THRESHOLD" 'BEGIN{exit !(r+0 >= t+0)}' \
  && { echo "VERDICT: PASS (long-run reliability ${OREL}% ≥ ${THRESHOLD}%)"; exit 0; } \
  || { echo "VERDICT: FAIL (long-run reliability ${OREL}% vs ${THRESHOLD}%)"; exit 1; }
