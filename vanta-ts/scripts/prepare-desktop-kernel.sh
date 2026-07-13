#!/usr/bin/env bash
# Desktop packaging needs a release-path kernel resource. The normal installer
# has already obtained a checksum-verified native binary at target/debug, so
# reuse it before requiring a local Rust toolchain.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE="$ROOT/target/debug/vanta-kernel"
DESTINATION="$ROOT/target/release/vanta-kernel"

if [ -x "$SOURCE" ]; then
  mkdir -p "$(dirname "$DESTINATION")"
  cp "$SOURCE" "$DESTINATION"
  chmod +x "$DESTINATION"
  printf 'vanta: desktop package reusing the verified runtime kernel\n'
  exit 0
fi

command -v cargo >/dev/null 2>&1 || {
  printf 'vanta: no runtime kernel or Rust toolchain is available for desktop packaging\n' >&2
  exit 1
}
(cd "$ROOT" && cargo build --release --bin vanta-kernel)
