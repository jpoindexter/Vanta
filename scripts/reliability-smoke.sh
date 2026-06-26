#!/usr/bin/env bash
# VANTA RELIABILITY SMOKE — drive REAL one-shot `vanta run` tasks end-to-end and assert each
# one COMPLETES, EXITS CLEAN (no hang), leaves NO zombie process, and returns sane output.
# This catches the bug class unit tests miss (one-shot hangs, sandbox denials, MCP-handle
# leaks) — the things that only surface by actually running the agent on real tasks.
#
# Needs: the kernel built + a configured provider (it makes real LLM calls).
# Usage:  scripts/reliability-smoke.sh [maxTasks]
#         VANTA_SMOKE_TIMEOUT=180 scripts/reliability-smoke.sh 3
set -uo pipefail
cd "$(dirname "$0")/.."
MAX="${1:-99}"
TIMEOUT="${VANTA_SMOKE_TIMEOUT:-150}"
PROBE="$HOME/Desktop/.vanta-smoke-probe.txt"

# name ::: instruction ::: expected-pattern (grep -iE — loose: a sane answer is present).
# Delimiter is ::: (not |) so the patterns can use | for alternation without colliding.
TASKS=(
  "math:::what is 2+2? reply with only the number:::(^|[^0-9])4([^0-9]|$)"
  "count:::count the TypeScript source files under vanta-ts/src excluding tests and reply with just the number:::[0-9]{2,}"
  "git:::how many commits are in this repo today? use git log and reply with the number:::[0-9]"
  "reason:::read vanta-ts/package.json and tell me the required node major version in one short line:::22|node|engine"
  "write:::write the exact text smoke-ok to $PROBE then read it back and confirm the contents:::smoke-ok"
  "codeexec:::write a python script to /tmp/vanta-sum.py that prints the sum of 1 to 10, run it with python3, and tell me the result:::(^|[^0-9])55([^0-9]|$)"
  "multitool:::find the 3 largest TypeScript files under vanta-ts/src by line count excluding tests, and name them with their line counts:::\\.ts"
  "a2a:::use the call_agent tool to ask claude to reply with exactly the single word READY:::READY"
)

pass=0; fail=0; i=0
echo "── vanta reliability smoke ── timeout ${TIMEOUT}s/task ──"
printf '%-7s %-7s %-6s %s\n' TASK RESULT TIME NOTE
for entry in "${TASKS[@]}"; do
  i=$((i + 1)); [ "$i" -gt "$MAX" ] && break
  name="${entry%%:::*}"; r="${entry#*:::}"; instr="${r%%:::*}"; expect="${r##*:::}"
  out="$(mktemp)"; rm -f "$PROBE"
  ( ./run.sh run "$instr" >"$out" 2>&1; echo "[[EXIT $?]]" >>"$out" ) &
  pid=$!; start=$SECONDS
  until grep -q '\[\[EXIT' "$out" 2>/dev/null || [ $((SECONDS - start)) -gt "$TIMEOUT" ]; do sleep 2; done
  dur=$((SECONDS - start))

  if ! grep -q '\[\[EXIT' "$out"; then                         # never exited → HANG (the bug class)
    kill "$pid" 2>/dev/null; pkill -f 'cli.ts run' 2>/dev/null
    printf '%-7s \033[31m%-6s\033[0m %-5ss never exited in %ss\n' "$name" "HANG" "$dur" "$TIMEOUT"
    fail=$((fail + 1)); rm -f "$out"; continue
  fi
  code="$(grep -oE '\[\[EXIT [0-9]+' "$out" | grep -oE '[0-9]+')"
  sleep 1; zomb="$(pgrep -f 'cli.ts run' | wc -l | tr -d ' ')"   # 1s grace for teardown, then count leaks
  notes=""
  [ "$code" != "0" ] && notes="exit=$code "
  [ "$zomb" != "0" ] && notes="${notes}zombies=$zomb "
  grep -qiE "$expect" "$out" || notes="${notes}output-mismatch "

  if [ -z "$notes" ]; then
    printf '%-7s \033[32m%-6s\033[0m %-5ss clean exit, sane output\n' "$name" "PASS" "$dur"; pass=$((pass + 1))
  else
    printf '%-7s \033[31m%-6s\033[0m %-5ss %s\n' "$name" "FAIL" "$dur" "$notes"; fail=$((fail + 1))
  fi
  rm -f "$out"
done
rm -f "$PROBE"
echo "──────────────────────────────"
echo "PASS=$pass FAIL=$fail   (lingering run procs: $(pgrep -f 'cli.ts run' | wc -l | tr -d ' '))"
[ "$fail" -eq 0 ]
