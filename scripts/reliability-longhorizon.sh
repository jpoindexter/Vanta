#!/usr/bin/env bash
# VANTA RELIABILITY — LONG-HORIZON & MULTI-TURN.  The #3 escalation past reliability-stress.sh:
# stress.sh proved SHORT one-shots are reliable; this probes the harder, less-tested dimension —
# a single run that must take MANY tool iterations while holding intermediate state, and a real
# MULTI-TURN conversation where context must survive across separate user turns.
#
# Scores the same two axes as stress.sh: RELIABILITY (terminates / clean exit / no zombie = the
# readiness bar) vs SUCCESS (also-correct-output). Exit keys on reliability.
#
# Usage:  K=2 scripts/reliability-longhorizon.sh
#         VANTA_PROVIDER=ollama VANTA_MODEL=qwen2.5:14b VANTA_LH_TIMEOUT=300 scripts/reliability-longhorizon.sh
set -uo pipefail
cd "$(dirname "$0")/.."

K="${K:-2}"
TIMEOUT="${VANTA_LH_TIMEOUT:-300}"            # long-horizon runs take longer → bigger default
THRESHOLD="${LH_THRESHOLD:-90}"
TMP_PREFIX="/tmp/vanta-lh"

# Long-horizon single-turn tasks: each forces a LONG agent loop (many tool calls) that must
# carry intermediate results forward within one turn — the stress one-shots did not.
TASKS=(
  # 3 writes + 3 reads + a sum: must track 3 values across 6+ tool calls. 10+20+30=60.
  "statechain:::create the file ${TMP_PREFIX}-a.txt containing only 10, ${TMP_PREFIX}-b.txt containing only 20, and ${TMP_PREFIX}-c.txt containing only 30; then read all three back and tell me their sum:::(^|[^0-9])60([^0-9]|$)"
  # 3 reads + compare: read three real files, count lines, name the largest.
  "multifile:::tell me the line count of each of these three files and which is largest: vanta-ts/package.json, README.md, and STRATEGY.md:::README|STRATEGY|package"
  # build -> run -> parse: write code, execute it, report a specific element.
  "buildrun:::write a python script to ${TMP_PREFIX}-fib.py that prints the first 10 Fibonacci numbers starting 1 1, run it with python3, and tell me the 10th number:::55|fib"
  # 4 independent counts in one turn: must not lose track partway.
  "longcount:::under vanta-ts/src, count the .ts files, the .test.ts files, the .tsx files, and the .json files separately, and give me all four numbers:::[0-9]"
  # explore + rank: many ls/glob calls, pick the max — a real multi-step decision.
  "explore:::list the immediate subdirectories of vanta-ts/src, find which one contains the most .ts files, and tell me its name and that count:::[0-9]"
)

run_one() {  # <instr> <expect> <outfile> → "RELIABLE|UNRELIABLE <reason> <dur>"
  local instr="$1" expect="$2" out="$3" pid start dur code
  ( ./run.sh run "$instr" >"$out" 2>&1; echo "[[EXIT $?]]" >>"$out" ) &
  pid=$!; start=$SECONDS
  until grep -q '\[\[EXIT' "$out" 2>/dev/null || [ $((SECONDS - start)) -gt "$TIMEOUT" ]; do sleep 2; done
  dur=$((SECONDS - start))
  if ! grep -q '\[\[EXIT' "$out"; then
    kill "$pid" 2>/dev/null; pkill -f 'cli.ts run' 2>/dev/null
    echo "UNRELIABLE hang ${dur}"; return
  fi
  code="$(grep -oE '\[\[EXIT [0-9]+' "$out" | grep -oE '[0-9]+')"
  [ "$code" != "0" ] && { echo "UNRELIABLE exit=$code ${dur}"; return; }
  echo "RELIABLE ok ${dur}"
}
pct() { awk -v n="$1" -v d="$2" 'BEGIN{ if(d==0){print "0.0"}else{printf "%.1f", 100*n/d} }'; }

echo "── VANTA LONG-HORIZON & MULTI-TURN ── provider=${VANTA_PROVIDER:-<.env>} K=${K} timeout=${TIMEOUT}s ──"
echo "── warming provider (untimed, not scored) ──"
./run.sh run "reply with the word ready only" >/dev/null 2>&1 || true
printf '%-11s %-7s %-7s %-10s %s\n' TASK RELIAB SUCCESS TIME NOTE

declare -i RUNS=0 RELIABLE=0 SUCCESS=0 HANGS=0 BADEXIT=0 MISMATCH=0 ZOMBIE=0
for entry in "${TASKS[@]}"; do
  name="${entry%%:::*}"; rest="${entry#*:::}"; instr="${rest%%:::*}"; expect="${rest##*:::}"
  t_rel=0; t_succ=0; t_min=99999; t_max=0; t_sum=0; note=""
  for ((rep = 1; rep <= K; rep++)); do
    out="$(mktemp)"; rm -f "${TMP_PREFIX}"-*.txt "${TMP_PREFIX}"-fib.py
    read -r verdict reason dur <<<"$(run_one "$instr" "$expect" "$out")"
    RUNS+=1; t_sum=$((t_sum + dur))
    [ "$dur" -lt "$t_min" ] && t_min=$dur; [ "$dur" -gt "$t_max" ] && t_max=$dur
    if [ "$verdict" = "RELIABLE" ]; then
      RELIABLE+=1; t_rel=$((t_rel + 1))
      sleep 1; z="$(pgrep -f 'cli.ts run' | wc -l | tr -d ' ')"; [ "$z" != "0" ] && { ZOMBIE+=1; note="${note}zombie "; }
      if grep -qiE "$expect" "$out"; then SUCCESS+=1; t_succ=$((t_succ + 1)); else MISMATCH+=1; note="${note}miss "; fi
    else
      case "$reason" in hang) HANGS+=1; note="${note}HANG ";; exit=*) BADEXIT+=1; note="${note}${reason} ";; esac
    fi
    rm -f "$out"
  done
  col=32; [ "$t_rel" -lt "$K" ] && col=31
  printf '%-11s \033[%sm%4s%%\033[0m  %5s%%  %ss(%s-%s)  %s\n' \
    "$name" "$col" "$(pct "$t_rel" "$K")" "$(pct "$t_succ" "$K")" "$((t_sum / K))" "$t_min" "$t_max" "${note:-clean}"
done
rm -f "${TMP_PREFIX}"-*.txt "${TMP_PREFIX}"-fib.py

# ── Piped-REPL exit probe (regression for fix 79fce703). Per DECISIONS 2026-06-27, piping a
# multi-turn conversation into the non-TTY REPL is NOT a supported path (headless = `vanta run`;
# programmatic multi-turn = agent_session/gateway, which DO carry context). The bar here is only
# that the REPL EXITS CLEANLY on stdin EOF instead of hanging on mounted MCP handles (79fce703).
echo "── piped-REPL exit probe (regression for 79fce703, ${TIMEOUT}s cap) ──"
mt_out="$(mktemp)"
( printf 'what is 2+2? reply with only the number\n' | VANTA_NO_TUI=1 ./run.sh >"$mt_out" 2>&1; echo "[[EXIT $?]]" >>"$mt_out" ) &
mtpid=$!; mtstart=$SECONDS
until grep -q '\[\[EXIT' "$mt_out" 2>/dev/null || [ $((SECONDS - mtstart)) -gt "$TIMEOUT" ]; do sleep 2; done
mtdur=$((SECONDS - mtstart)); mt_reliable=0
if grep -q '\[\[EXIT' "$mt_out"; then mt_reliable=1; else kill "$mtpid" 2>/dev/null; pkill -f 'cli.ts' 2>/dev/null; fi
echo "  piped-REPL: exits-clean=${mt_reliable} (${mtdur}s)"
rm -f "$mt_out"

echo "──────────────────────────────────────────────"
OREL="$(pct "$RELIABLE" "$RUNS")"; OSUCC="$(pct "$SUCCESS" "$RUNS")"
echo "long-horizon → RUNS=$RUNS RELIABLE=${RELIABLE} (${OREL}%) SUCCESS=${SUCCESS} (${OSUCC}%)"
echo "failure modes → hangs=$HANGS bad-exit=$BADEXIT zombies=$ZOMBIE output-miss=$MISMATCH"
echo "piped-REPL    → exits-clean=${mt_reliable} (piped multi-turn unsupported by design — DECISIONS 2026-06-27)"
echo "lingering procs: $(pgrep -f 'cli.ts' | wc -l | tr -d ' ')"
awk -v r="$OREL" -v t="$THRESHOLD" 'BEGIN{exit !(r+0 >= t+0)}' && [ "$mt_reliable" -eq 1 ] \
  && { echo "VERDICT: PASS (long-horizon ${OREL}% ≥ ${THRESHOLD}%, piped-REPL exits clean)"; exit 0; } \
  || { echo "VERDICT: FAIL (long-horizon ${OREL}% vs ${THRESHOLD}%, or piped-REPL hung)"; exit 1; }
