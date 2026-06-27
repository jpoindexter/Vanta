#!/usr/bin/env bash
# VANTA USE-CASE SURFACE TEST — can Vanta run what the Hermes/OpenClaw community actually builds?
# Drives REAL `vanta run` tasks distilled from the 262 Hermes user stories and checks two axes per
# surface: RELIABLE (clean exit) and SURFACE-HIT (the expected tool/route actually engaged, grepped
# from the streamed tool-call lines). Live-gated surfaces (messaging/email/voice/calendar) pass on
# ROUTING — the agent reaches the right tool, then declines for missing creds (correct unattended).
#
# Needs: kernel + a configured provider. Usage: scripts/usecase-surfaces.sh
set -uo pipefail
cd "$(dirname "$0")/.."
TIMEOUT="${VANTA_UC_TIMEOUT:-150}"
export VANTA_READABLE_DIRS="${VANTA_READABLE_DIRS:-/tmp}" VANTA_WRITABLE_DIRS="${VANTA_WRITABLE_DIRS:-/tmp}"

# bucket ::: instruction ::: expected-surface-regex (tool call OR a sane routed result)
TASKS=(
  "schedule:::set up a scheduled/cron task that greets me every morning at 9am:::cron|schedul"
  "skill:::create and save a new reusable skill named usecase-test-brief with 3 steps for a daily brief:::write_skill|skill"
  "memory:::save to your long-term memory/brain that my favorite color is teal:::brain|remember|memory"
  "research:::use web search to find a trending AI agent framework and name one:::web_search|web_fetch|research|search|reddit|rss"
  "delegate:::delegate to a subagent: count the words in the phrase hello brave world, reply with the number:::delegate|swarm|call_agent|subagent|team"
  "todo:::create a todo list with three items: alpha, beta, gamma:::todo|task"
  "code:::write a python script to /tmp/uc-surface.py that prints 7 times 6, run it, tell me the result:::(^|[^0-9])42([^0-9]|$)"
  "obsidian:::search my obsidian vault for the word vanta and tell me whether you found anything:::vault|obsidian"
  "calendar:::create a calendar event titled UsecaseTest tomorrow at 3pm:::calendar"
  "email:::draft an email to nobody@example.com subject UsecaseTest body saying hello there:::gmail_draft|gmail"
  "voice:::use text-to-speech to say the single word test:::speak|tts|voice|audio"
  "browser:::use the browser to open example.com and tell me the page title:::browser|screenshot|playwright|navigate"
)

run_one() {  # <instr> <out> → "RELIABLE|UNRELIABLE <dur>"
  local instr="$1" out="$2" pid start dur
  ( ./run.sh run "$instr" >"$out" 2>&1; echo "[[EXIT $?]]" >>"$out" ) & pid=$!; start=$SECONDS
  until grep -q '\[\[EXIT' "$out" 2>/dev/null || [ $((SECONDS - start)) -gt "$TIMEOUT" ]; do sleep 2; done
  dur=$((SECONDS - start))
  if ! grep -q '\[\[EXIT' "$out"; then kill "$pid" 2>/dev/null; pkill -f 'cli.ts run' 2>/dev/null; echo "UNRELIABLE ${dur}"; return; fi
  [ "$(grep -oE '\[\[EXIT [0-9]+' "$out" | grep -oE '[0-9]+')" != "0" ] && { echo "UNRELIABLE ${dur}"; return; }
  echo "RELIABLE ${dur}"
}

echo "── VANTA USE-CASE SURFACE TEST ── provider=${VANTA_PROVIDER:-<.env>} timeout=${TIMEOUT}s ──"
./run.sh run "reply with the word ready only" >/dev/null 2>&1 || true   # warm
printf '%-9s %-9s %-7s %s\n' SURFACE RELIABLE HIT TIME
declare -i REL=0 HIT=0 N=0
for entry in "${TASKS[@]}"; do
  N+=1; name="${entry%%:::*}"; rest="${entry#*:::}"; instr="${rest%%:::*}"; rx="${rest##*:::}"
  out="$(mktemp)"; read -r verdict dur <<<"$(run_one "$instr" "$out")"
  rel="no"; hit="no"
  [ "$verdict" = "RELIABLE" ] && { rel="yes"; REL+=1; }
  grep -qiE "$rx" "$out" && { hit="yes"; HIT+=1; } || cp "$out" "/tmp/uc-miss-${name}.log"
  cr=32; [ "$rel" = no ] && cr=31; ch=32; [ "$hit" = no ] && ch=31
  printf '%-9s \033[%sm%-9s\033[0m \033[%sm%-7s\033[0m %ss\n' "$name" "$cr" "$rel" "$ch" "$hit" "$dur"
  rm -f "$out"
done
# cleanup test artifacts
rm -f /tmp/uc-surface.py; rm -rf ~/.vanta/skills/usecase-test-brief 2>/dev/null
echo "──────────────────────────────────────────────"
echo "SURFACES=$N  RELIABLE=$REL  SURFACE-HIT=$HIT   (misses kept at /tmp/uc-miss-*.log)"
