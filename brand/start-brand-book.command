#!/bin/zsh

set -e

script_dir=${0:A:h}
server_port=8083
brand_url="http://127.0.0.1:${server_port}/index.html"
log_file="/tmp/vanta-brand-book-server.log"

if ! lsof -nP -iTCP:${server_port} -sTCP:LISTEN >/dev/null 2>&1; then
  nohup python3 -m http.server "${server_port}" \
    --bind 127.0.0.1 \
    --directory "${script_dir}" \
    >"${log_file}" 2>&1 &

  server_pid=$!
  disown "${server_pid}" 2>/dev/null || true

  for attempt in {1..20}; do
    if curl -fsS "${brand_url}" >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done
fi

open "${brand_url}"
