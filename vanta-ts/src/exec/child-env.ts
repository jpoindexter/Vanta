const SAFE_CHILD_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "COLORTERM",
  "TMPDIR",
  "TZ",
  "SHELL",
  "CI",
  "NO_COLOR",
  "FORCE_COLOR",
] as const;

const WIN32_CHILD_ENV_KEYS = ["SystemRoot", "PATHEXT", "COMSPEC", "TEMP", "TMP"] as const;

/**
 * Minimal environment for model-controlled subprocesses. Provider keys,
 * OAuth tokens, gateway credentials, audit material, and arbitrary session
 * variables never cross this boundary implicitly.
 */
export function buildSafeChildEnv(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const keys = platform === "win32"
    ? [...SAFE_CHILD_ENV_KEYS, ...WIN32_CHILD_ENV_KEYS]
    : SAFE_CHILD_ENV_KEYS;
  const out: NodeJS.ProcessEnv = {};
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}
