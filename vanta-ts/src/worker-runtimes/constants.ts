/** Adapter prefix that marks a hired worker as an external runtime ("cli:claude-code"). */
export const RUNTIME_ADAPTER_PREFIX = "cli:";

export const NATIVE_RUNTIME_ID = "vanta-native";
export const CLAUDE_RUNTIME_ID = "claude-code";
export const CODEX_RUNTIME_ID = "codex";
export const HERMES_RUNTIME_ID = "hermes";

/** Tool name used for the approval card, so an "Always" rule is the existing call_agent rule, scoped to the project. */
export const APPROVAL_TOOL_NAME = "call_agent";

export const DEFAULT_RUN_TIMEOUT_MS = 30 * 60_000;
export const PROBE_TIMEOUT_MS = 5_000;
export const KILL_GRACE_MS = 5_000;

export const PROMPT_PREVIEW_CHARS = 400;
export const SUMMARY_MAX_CHARS = 500;
export const ARTIFACT_MAX_CHARS = 8_000;
export const MAX_CHANGED_FILES = 200;
export const EVENT_TEXT_MAX_CHARS = 200;
