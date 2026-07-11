import type { SlashHandler, SlashResult } from "./types.js";
import { parseEnvArg, sessionEnvStore, type SessionEnvStore, type SessionEnv } from "./session-env.js";
import { redactForLog } from "../store/redact-structural.js";

const CREDENTIAL_ENV_KEY = /(?:^|_)(?:API_?KEY|ACCESS_?KEY|AUTH|BEARER|COOKIE|CREDENTIALS?|PASS(?:WORD)?|PRIVATE_?KEY|REFRESH_?TOKEN|SECRET|SESSION_?TOKEN|TOKEN)(?:_|$)/i;

function displayEnvValue(key: string, value: string): string {
  return CREDENTIAL_ENV_KEY.test(key) ? "[REDACTED]" : redactForLog(value);
}

/** Render the current session env as a sorted, aligned list (or an empty note). */
function formatEnv(snapshot: SessionEnv): string {
  const keys = Object.keys(snapshot).sort();
  if (keys.length === 0) {
    return "  (no session env vars — set one with /env KEY=value)";
  }
  const w = Math.min(24, Math.max(...keys.map((k) => k.length)) + 1);
  const rows = keys.map((k) => `  ${k.padEnd(w)} ${displayEnvValue(k, snapshot[k] ?? "")}`);
  return [`  ${keys.length} session env var(s):`, ...rows].join("\n");
}

/** Build the `/env` handler over a given store (default: the shared one). */
export function buildEnvHandler(store: SessionEnvStore = sessionEnvStore): SlashHandler {
  return (arg): SlashResult => {
    const parsed = parseEnvArg(arg);
    switch (parsed.action) {
      case "list":
        return { output: formatEnv(store.snapshot()) };
      case "set":
        store.set(parsed.key, parsed.value);
        return { output: `  ◈ set ${parsed.key} for child processes this session` };
      case "unset": {
        const existed = store.unset(parsed.key);
        return { output: existed ? `  ✘ unset ${parsed.key}` : `  (no session env var "${parsed.key}")` };
      }
      case "error":
        return { output: `  ${parsed.message}` };
    }
  };
}

/** `/env` — set/list/unset session-scoped env vars for child process spawns. */
export const env: SlashHandler = buildEnvHandler();
