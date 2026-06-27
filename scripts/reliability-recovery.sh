#!/usr/bin/env bash
# VANTA PROVIDER-HARDENING — LIVE RECOVERY (closes the "recovery-from-transient is unit-not-live"
# caveat). A fault proxy STALLS the first real codex /responses call (no SSE → the codex idle-timeout
# fires → abort → the bounded transient-retry kicks in) then SERVES the second call a valid
# Responses-API stream — so the run RECOVERS from a genuine transient failure and COMPLETES. Real
# HTTP round-trips, a real abort, a real retry, a real success. Needs codex/.env + VANTA_CODEX_BASE_URL
# override (codex-auth.ts). Sibling to reliability-faultinject.sh (which proves the graceful-STOP path).
set -uo pipefail
cd "$(dirname "$0")/.."
PORT="${RECOVERY_PORT:-8899}"; PLOG="$(mktemp)"
lsof -ti "tcp:${PORT}" 2>/dev/null | xargs kill -9 2>/dev/null || true   # clear any stale listener
# Fault proxy: request 1 stalls (held open, never answered → idle-timeout); request 2+ serves SSE.
PORT="$PORT" node -e '
const http=require("http"); let n=0; const P=process.env.PORT;
http.createServer((req,res)=>{ n++; console.error("REQ "+n+" "+req.url);
  if(req.method==="POST" && req.url.endsWith("/responses")){
    req.on("data",()=>{}); req.on("end",()=>{
      if(n===1) return;                                  // STALL the first call (no response)
      res.writeHead(200,{"Content-Type":"text/event-stream"});
      res.write("data: {\"type\":\"response.output_text.delta\",\"delta\":\"yes\"}\n\n");
      res.write("data: {\"type\":\"response.completed\",\"response\":{\"usage\":{\"input_tokens\":1,\"output_tokens\":1}}}\n\n");
      res.end();
    });
  } else { res.writeHead(404); res.end(); }
}).listen(P,"127.0.0.1",()=>console.error("PROXY UP "+P));
' >/dev/null 2>"$PLOG" &
proxy=$!
until grep -q "PROXY UP" "$PLOG" 2>/dev/null; do sleep 0.2; done
out="$(mktemp)"; start=$SECONDS
VANTA_PROVIDER=codex VANTA_CODEX_BASE_URL="http://127.0.0.1:${PORT}" \
  VANTA_PROVIDER_TIMEOUT_SEC=3 VANTA_PROVIDER_RETRIES=2 VANTA_PROVIDER_RETRY_BACKOFF_MS=0 \
  ./run.sh run "is 17 prime? reply with one word" >"$out" 2>&1
code=$?; dur=$((SECONDS - start)); kill "$proxy" 2>/dev/null
reqs=$(grep -c '^REQ ' "$PLOG")
echo "── live recovery (timeout=3s, retries=2) → exit=$code wall=${dur}s · proxy-requests=$reqs ──"
ok=1
[ "$code" = "0" ]                                   || { echo "FAIL: run did not exit clean (exit=$code)"; ok=0; }
[ "$reqs" -ge 2 ]                                   || { echo "FAIL: proxy saw $reqs request(s) — the retry never happened"; ok=0; }
grep -qi "yes" "$out"                               || { echo "FAIL: run did not recover the served answer (never completed)"; ok=0; }
grep -qi "Stopped: provider error" "$out" && { echo "FAIL: run gave UP (graceful stop) instead of recovering"; ok=0; }
echo "── evidence ──"; grep -iE "yes|Stopped|iteration|REQ" "$PLOG" "$out" 2>/dev/null | tail -4
rm -f "$out" "$PLOG"
[ "$ok" = 1 ] && echo "VERDICT: PASS — live: 1st call stalled → idle-timeout → retried → 2nd call served → RECOVERED in ${dur}s (proxy saw $reqs reqs)" \
             || { echo "VERDICT: FAIL"; exit 1; }
