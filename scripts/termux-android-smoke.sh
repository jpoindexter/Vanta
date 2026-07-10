#!/usr/bin/env bash
set -euo pipefail

TERMUX_VERSION="0.118.3"
TERMUX_PACKAGE="com.termux"
TERMUX_PREFIX="/data/data/com.termux/files/usr"
TERMUX_HOME="/data/data/com.termux/files/home"
APK_NAME="termux-app_v${TERMUX_VERSION}+github-debug_x86_64.apk"
APK_URL="https://github.com/termux/termux-app/releases/download/v${TERMUX_VERSION}/termux-app_v${TERMUX_VERSION}%2Bgithub-debug_x86_64.apk"
APK_SHA256="3550e61f4d9eb49b712fd1bd9519dc37085a4d8eb597c57a340f0a64859b7144"
APK_PATH="${RUNNER_TEMP:-/tmp}/${APK_NAME}"
SOURCE_ARCHIVE="${RUNNER_TEMP:-/tmp}/vanta-termux-source.tgz"

termux_run() {
  local body="$1"
  local remote="$TERMUX_HOME/.vanta-ci-step.sh"
  {
    cat <<HEADER
set -euo pipefail
export HOME="$TERMUX_HOME"
export PREFIX="$TERMUX_PREFIX"
export PATH="$TERMUX_PREFIX/bin"
export TMPDIR="$TERMUX_PREFIX/tmp"
export SHELL="$TERMUX_PREFIX/bin/bash"
export TERMUX_VERSION="$TERMUX_VERSION"
export DEBIAN_FRONTEND=noninteractive
cd "$TERMUX_HOME"
HEADER
    printf '%s\n' "$body"
  } | adb exec-out run-as "$TERMUX_PACKAGE" sh -c "cat > '$remote'"
  adb shell run-as "$TERMUX_PACKAGE" "$TERMUX_PREFIX/bin/bash" "$remote"
}

echo "Downloading checksum-pinned Termux ${TERMUX_VERSION} x86_64 APK"
curl -fsSL --retry 3 "$APK_URL" -o "$APK_PATH"
printf '%s  %s\n' "$APK_SHA256" "$APK_PATH" | sha256sum -c -

adb wait-for-device
adb install -r "$APK_PATH"
adb shell am force-stop "$TERMUX_PACKAGE" || true
adb shell monkey -p "$TERMUX_PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null

ready=0
for _ in $(seq 1 90); do
  if adb shell run-as "$TERMUX_PACKAGE" test -x "$TERMUX_PREFIX/bin/bash" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  adb logcat -d | tail -200
  echo "Termux bootstrap did not become ready" >&2
  exit 1
fi

termux_run '
pkg update -y
pkg install -y git nodejs-lts rust python make clang pkg-config
echo "TERMUX_TOOLCHAIN_OK node=$(node --version) rust=$(rustc --version) arch=$(uname -m) platform=$(node -p process.platform)"
'

tar \
  --exclude='./.git' \
  --exclude='./target' \
  --exclude='./vanta-ts/node_modules' \
  --exclude='./vanta-ts/.artifacts' \
  --exclude='./roadmap.html' \
  -czf "$SOURCE_ARCHIVE" .
cat "$SOURCE_ARCHIVE" | adb exec-out run-as "$TERMUX_PACKAGE" sh -c "cat > '$TERMUX_HOME/vanta-source.tgz'"
termux_run '
rm -rf "$HOME/Vanta"
mkdir -p "$HOME/Vanta"
tar -xzf "$HOME/vanta-source.tgz" -C "$HOME/Vanta"
cd "$HOME/Vanta"
./install.sh
'

termux_run '
cd "$HOME/Vanta"
cat > "$HOME/mock-openai.mjs" <<'"'"'NODE'"'"'
import { createServer } from "node:http";

createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", () => {
    if (req.url !== "/v1/chat/completions" || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    const request = JSON.parse(raw);
    if (!request.stream) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "termux-smoke",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "TERMUX_OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ id: "termux-smoke", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "TERMUX_OK" }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: "termux-smoke", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
}).listen(18080, "127.0.0.1", () => console.log("TERMUX_MOCK_MODEL_READY"));
NODE

node "$HOME/mock-openai.mjs" > "$HOME/mock-openai.log" 2>&1 &
mock_pid=$!
"$HOME/Vanta/target/debug/vanta-kernel" serve 7788 > "$HOME/kernel.log" 2>&1 &
kernel_pid=$!
trap '"'"'kill "$mock_pid" "$kernel_pid" 2>/dev/null || true'"'"' EXIT
sleep 3

export VANTA_HOME="$HOME/.vanta-ci"
export VANTA_PROVIDER=custom
export VANTA_OPENAI_BASE_URL=http://127.0.0.1:18080/v1
export VANTA_OPENAI_KEY=termux-smoke
export VANTA_MODEL=termux-smoke
export VANTA_KERNEL_URL=http://127.0.0.1:7788

vanta --help > "$HOME/vanta-help.txt"
grep -F "vanta" "$HOME/vanta-help.txt" >/dev/null
vanta doctor > "$HOME/vanta-doctor.txt"
cat "$HOME/vanta-doctor.txt"
grep -F "✓ kernel" "$HOME/vanta-doctor.txt"
grep -F "✓ provider" "$HOME/vanta-doctor.txt"
if grep -F "✗" "$HOME/vanta-doctor.txt"; then
  echo "vanta doctor was not green" >&2
  exit 1
fi

run_output=$(vanta run "Reply with TERMUX_OK and do not use tools" 2>&1)
printf "%s\n" "$run_output"
grep -F "TERMUX_OK" <<< "$run_output"
vanta gateway verify-channels

echo "TERMUX_ANDROID_E2E_OK abi=$(getprop ro.product.cpu.abi) node_platform=$(node -p process.platform) kernel=$(uname -m)"
'
