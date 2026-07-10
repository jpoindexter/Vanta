# shellcheck shell=sh
# Structured cold-install events + forensic output for run.sh/install.sh.

vanta_install_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

vanta_install_event() {
  event="$1"; stage="$2"; message="$3"
  at="$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date)"
  json="{\"version\":1,\"event\":\"$(vanta_install_escape "$event")\",\"stage\":\"$(vanta_install_escape "$stage")\",\"message\":\"$(vanta_install_escape "$message")\",\"at\":\"$(vanta_install_escape "$at")\"}"
  printf '%s\n' "$json" >> "$VANTA_INSTALL_EVENT_LOG"
  [ "${VANTA_INSTALL_QUIET:-0}" = 1 ] && return 0
  if [ "${VANTA_INSTALL_EVENTS:-human}" = json ]; then
    printf '%s\n' "$json" >&2
  else
    case "$event" in
      StageStarted)   printf 'vanta: [%s] %s…\n' "$stage" "$message" >&2 ;;
      StageRetry)     printf 'vanta: [%s] retrying — %s\n' "$stage" "$message" >&2 ;;
      StageCompleted) printf 'vanta: [%s] complete\n' "$stage" >&2 ;;
      StageFailed)    printf 'vanta: [%s] failed — %s\n' "$stage" "$message" >&2 ;;
      InstallCompleted) printf 'vanta: install complete · log: %s\n' "$VANTA_INSTALL_LOG" >&2 ;;
    esac
  fi
}

vanta_install_init() {
  mode="$1"; manifest="$2"
  install_home="${VANTA_STATE_HOME:-${VANTA_HOME:-$HOME/.vanta}}"
  stamp="$(date -u '+%Y%m%d-%H%M%S' 2>/dev/null || date '+%s')"
  log_dir="$install_home/logs"
  mkdir -p "$log_dir"
  VANTA_INSTALL_LOG="${VANTA_INSTALL_LOG:-$log_dir/install-$stamp.log}"
  VANTA_INSTALL_EVENT_LOG="${VANTA_INSTALL_EVENT_LOG:-$log_dir/install-$stamp.events.jsonl}"
  export VANTA_INSTALL_LOG VANTA_INSTALL_EVENT_LOG
  : > "$VANTA_INSTALL_LOG"
  : > "$VANTA_INSTALL_EVENT_LOG"
  chmod 600 "$VANTA_INSTALL_LOG" "$VANTA_INSTALL_EVENT_LOG" 2>/dev/null || true
  vanta_install_event Manifest install "$mode:$manifest"
  vanta_install_event Log install "$VANTA_INSTALL_LOG"
}

vanta_install_stage() {
  stage="$1"; label="$2"; shift 2
  attempt=1
  while :; do
    vanta_install_event StageStarted "$stage" "$label (attempt $attempt)"
    printf '\n[%s] %s (attempt %s)\n' "$stage" "$label" "$attempt" >> "$VANTA_INSTALL_LOG"
    status_file="$(mktemp "${TMPDIR:-/tmp}/vanta-install-status.XXXXXX")" || return 1
    (
      if "$@"; then stage_code=0; else stage_code=$?; fi
      printf '%s\n' "$stage_code" > "$status_file"
    ) 2>&1 | tee -a "$VANTA_INSTALL_LOG"
    stage_code="$(cat "$status_file" 2>/dev/null || printf 1)"
    rm -f "$status_file"
    if [ "$stage_code" -eq 0 ]; then
      vanta_install_event StageCompleted "$stage" "$label"
      return 0
    fi
    vanta_install_event StageFailed "$stage" "$label (exit $stage_code)"
    if [ "${VANTA_INSTALL_RETRY:-0}" = 1 ] && [ "$attempt" -eq 1 ]; then
      attempt=2
      vanta_install_event StageRetry "$stage" "automatic retry"
      continue
    fi
    if [ "${VANTA_INSTALL_NONINTERACTIVE:-0}" != 1 ] && [ -r /dev/tty ]; then
      printf 'Retry stage, open log, or quit? [r/o/q] ' >/dev/tty
      read -r install_answer </dev/tty 2>/dev/null || install_answer=q
      case "$install_answer" in
        [Rr]*) attempt=$((attempt + 1)); vanta_install_event StageRetry "$stage" "operator retry"; continue ;;
        [Oo]*) vanta_install_open_log ;;
      esac
    fi
    vanta_install_event InstallFailed install "$stage (exit $stage_code)"
    vanta_install_recovery "$stage"
    return "$stage_code"
  done
}

vanta_install_open_log() {
  if [ -n "${VANTA_INSTALL_OPEN_CMD:-}" ]; then
    "$VANTA_INSTALL_OPEN_CMD" "$VANTA_INSTALL_LOG" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$VANTA_INSTALL_LOG" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$VANTA_INSTALL_LOG" >/dev/null 2>&1 || true
  else
    printf 'Install log: %s\n' "$VANTA_INSTALL_LOG" >&2
  fi
}

vanta_install_recovery() {
  printf 'vanta: install stopped at stage %s.\n' "$1" >&2
  printf '  retry: VANTA_INSTALL_RETRY=1 %s\n' "${VANTA_INSTALL_RETRY_COMMAND:-./run.sh}" >&2
  printf '  open log: %s\n' "$VANTA_INSTALL_LOG" >&2
}

vanta_install_finish() {
  vanta_install_event InstallCompleted install "all stages complete"
}
