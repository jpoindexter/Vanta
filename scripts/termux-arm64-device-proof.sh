#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERMUX_PREFIX="${PREFIX:-}"
PROOF_HOME="${VANTA_TERMUX_PROOF_HOME:-$HOME/.vanta-termux-arm64-proof}"
MODEL_PORT="${VANTA_TERMUX_PROOF_MODEL_PORT:-18080}"
KERNEL_PORT="${VANTA_TERMUX_PROOF_KERNEL_PORT:-7788}"
REQUIRE_RELEASE_KERNEL=0

for arg in "$@"; do
  case "$arg" in
    --require-release-kernel) REQUIRE_RELEASE_KERNEL=1 ;;
    -h|--help)
      echo "usage: ./scripts/termux-arm64-device-proof.sh [--require-release-kernel]"
      exit 0
      ;;
    *)
      echo "unknown argument: $arg" >&2
      echo "usage: ./scripts/termux-arm64-device-proof.sh [--require-release-kernel]" >&2
      exit 1
      ;;
  esac
done

need_termux() {
  if [ -z "${TERMUX_VERSION:-}" ] && ! [[ "$TERMUX_PREFIX" == *"/com.termux/"* ]]; then
    echo "termux-arm64 proof requires a real Termux shell on Android." >&2
    exit 1
  fi
}

need_arm64() {
  local machine abi
  machine="$(uname -m)"
  case "$machine" in
    aarch64|arm64) ;;
    *)
      echo "termux-arm64 proof requires ARM64 hardware; got uname -m=$machine." >&2
      exit 1
      ;;
  esac
  if command -v getprop >/dev/null 2>&1; then
    abi="$(getprop ro.product.cpu.abi 2>/dev/null || true)"
    case "$abi" in
      arm64-v8a|"") ;;
      *)
        echo "termux-arm64 proof requires an ARM64 Android ABI; got ro.product.cpu.abi=$abi." >&2
        exit 1
        ;;
    esac
  fi
}

wait_for_http() {
  local url="$1"
  local name="$2"
  for _ in $(seq 1 40); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "$name did not become ready at $url" >&2
  return 1
}

need_termux
need_arm64

mkdir -p "$PROOF_HOME"
export PATH="${PREFIX:-/data/data/com.termux/files/usr}/bin:$PATH"
export VANTA_HOME="$PROOF_HOME/state"
export VANTA_PLATFORM=termux
export VANTA_PROVIDER=custom
export VANTA_OPENAI_BASE_URL="http://127.0.0.1:${MODEL_PORT}/v1"
export VANTA_OPENAI_KEY=termux-arm64-proof
export VANTA_MODEL=termux-arm64-proof
export VANTA_KERNEL_URL="http://127.0.0.1:${KERNEL_PORT}"
if [ "$REQUIRE_RELEASE_KERNEL" = "1" ]; then
  export VANTA_REQUIRE_PREBUILT_KERNEL=1
fi

echo "TERMUX_ARM64_PROOF_START root=$ROOT"
pkg update -y
pkg install -y curl git nodejs-lts python esbuild

cd "$ROOT"
if [ "$REQUIRE_RELEASE_KERNEL" = "1" ]; then
  rm -f "$ROOT/target/debug/vanta-kernel"
fi
./install.sh

cat > "$PROOF_HOME/mock-openai.mjs" <<'NODE'
import { createServer } from "node:http";

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/ready") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok\n");
    return;
  }
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", () => {
    if (req.url !== "/v1/chat/completions" || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    const request = JSON.parse(raw || "{}");
    if (!request.stream) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "termux-arm64-proof",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "TERMUX_OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ id: "termux-arm64-proof", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "TERMUX_OK" }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: "termux-arm64-proof", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
}).listen(Number(process.env.VANTA_TERMUX_PROOF_MODEL_PORT || 18080), "127.0.0.1", () => {
  console.log("TERMUX_ARM64_MOCK_MODEL_READY");
});
NODE

node "$PROOF_HOME/mock-openai.mjs" > "$PROOF_HOME/mock-openai.log" 2>&1 &
model_pid=$!
"$ROOT/target/debug/vanta-kernel" serve "$KERNEL_PORT" > "$PROOF_HOME/kernel.log" 2>&1 &
kernel_pid=$!
cleanup() {
  kill "$model_pid" "$kernel_pid" 2>/dev/null || true
}
trap cleanup EXIT

wait_for_http "http://127.0.0.1:${MODEL_PORT}/ready" "mock model"
wait_for_http "http://127.0.0.1:${KERNEL_PORT}/api/status" "kernel"

vanta --help > "$PROOF_HOME/help.txt"
grep -F "vanta" "$PROOF_HOME/help.txt" >/dev/null

vanta doctor > "$PROOF_HOME/doctor.txt"
cat "$PROOF_HOME/doctor.txt"
grep -F "kernel" "$PROOF_HOME/doctor.txt" >/dev/null
grep -F "provider" "$PROOF_HOME/doctor.txt" >/dev/null
if grep -F "$(printf '\342\234\227')" "$PROOF_HOME/doctor.txt"; then
  echo "vanta doctor was not green" >&2
  exit 1
fi

run_output="$(vanta run "Reply with TERMUX_OK and do not use tools" 2>&1)"
printf "%s\n" "$run_output"
grep -F "TERMUX_OK" <<< "$run_output" >/dev/null

vanta gateway verify-channels

mkdir -p "$ROOT/.vanta"
proof_line="TERMUX_ARM64_E2E_OK release_kernel=${REQUIRE_RELEASE_KERNEL} abi=$(getprop ro.product.cpu.abi 2>/dev/null || echo unknown) node_platform=$(node -p process.platform) kernel=$(uname -m)"
printf "%s\n" "$proof_line" | tee "$ROOT/.vanta/termux-arm64-proof.txt"
