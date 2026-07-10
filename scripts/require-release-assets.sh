#!/usr/bin/env bash
set -euo pipefail

dir="${1:-dist}"
required=(
  "vanta-kernel-aarch64-linux-android"
  "vanta-kernel-aarch64-linux-android.sha256"
)

if [ ! -d "$dir" ]; then
  echo "release asset directory missing: $dir" >&2
  exit 1
fi

missing=0
for asset in "${required[@]}"; do
  if [ ! -s "$dir/$asset" ]; then
    echo "missing required release asset: $asset" >&2
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "refusing to publish release without Android/Bionic kernel assets" >&2
  exit 1
fi

echo "required release assets present: ${required[*]}"
