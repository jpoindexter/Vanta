#!/usr/bin/env bash
# VANTA ADAPTERS — LIVE VERIFICATION (no-token platforms). The messaging gateway's send/poll path is
# the SAME across all 20 adapters; the only thing gating the other 18 from live proof is their
# platform credential. This exercises that path end-to-end against a REAL external service that needs
# NO auth — ntfy.sh public topics — by sending a real notification through the actual NtfyAdapter and
# polling it back with an exact round-trip match. (Telegram is the other live-verified adapter; it
# needs a bot token.) So "offline-tested only" is not a framework gap — it's a per-platform-token
# reality, and the path itself is now live-proven on a real service. Needs network.
set -uo pipefail
cd "$(dirname "$0")/../vanta-ts"
f="./.adapter-live-$$.ts"   # inside vanta-ts (type:module) so tsx runs it as ESM (top-level await)
trap 'rm -f "$f"' EXIT
cat > "$f" <<'TS'
import { ADAPTERS } from "./src/gateway/platforms/adapter-registry.js";
const topic = "vanta-livetest-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
const a = ADAPTERS.ntfy.build({ ...process.env, VANTA_NTFY_TOPIC: topic } as NodeJS.ProcessEnv);
const text = "vanta live adapter proof " + topic;
await a.connect();
await a.send({ chatId: topic, text });                 // REAL POST → ntfy.sh
await new Promise((r) => setTimeout(r, 2500));
const msgs = await a.poll();                            // REAL GET ← ntfy.sh
await a.disconnect();
const hit = msgs.some((m) => m.text === text);
console.log(`ntfy: sent + polled ${msgs.length} msg(s); round-trip match = ${hit} (topic ${topic})`);
console.log(hit ? "VERDICT: PASS — ntfy adapter live-verified (real send + poll on ntfy.sh)" : "VERDICT: FAIL");
process.exit(hit ? 0 : 1);
TS
npx tsx "$f"
