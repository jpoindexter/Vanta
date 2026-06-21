/**
 * VANTA-BG-FLAG-PRESERVE — preserve a session's startup flags across a
 * relaunch/background re-exec.
 *
 * When `/restart` (see `repl/restart-cmd.ts` — `RESTART_EXIT_CODE` 75, re-execed
 * by run.sh) or a future `/bg` backgrounds a session, the relaunch must run with
 * the SAME configuration as the foreground one: today a bare re-exec can silently
 * drop the model/provider/effort/permission-mode/resume target/etc.
 *
 * This module is PURE: `captureStartupFlags(argv)` reads only the allowlisted
 * known flags off argv; `buildRelaunchArgv(captured, extra?)` rebuilds the argv
 * to relaunch with (preserved flags + values + extras, deduped). The relaunch
 * site (restart-cmd.ts / a `/bg` handler) would call
 * `buildRelaunchArgv(captureStartupFlags(process.argv))` to spawn the background
 * session — see the WIRING note below.
 *
 * SECURITY: only flags in PRESERVED_FLAGS are ever carried. A stray `--dangerous`
 * an attacker appended to argv is ignored, never auto-propagated. Values are
 * carried verbatim, but the flag SET is allowlisted.
 */

/** One known startup flag: its name and whether it takes a value. */
export type PreservedFlagSpec = {
  flag: string;
  takesValue: boolean;
};

/** A captured flag occurrence: the flag plus its value if it takes one. */
export type CapturedFlag = {
  flag: string;
  value?: string;
};

/**
 * The allowlist of startup flags to carry across a relaunch. Mirrors the flags
 * parsed in cli.ts / cli/startup.ts / cli/permission-mode.ts. Value-taking flags
 * carry their value; boolean flags are emitted once with no value.
 */
export const PRESERVED_FLAGS: readonly PreservedFlagSpec[] = [
  { flag: "--model", takesValue: true },
  { flag: "--provider", takesValue: true },
  { flag: "--effort", takesValue: true },
  { flag: "--permission-mode", takesValue: true },
  { flag: "--resume", takesValue: true },
  { flag: "--max-budget-usd", takesValue: true },
  { flag: "--bare", takesValue: false },
  { flag: "--safe-mode", takesValue: false },
  { flag: "--fork-session", takesValue: false },
] as const;

const SPEC_BY_FLAG = new Map<string, PreservedFlagSpec>(
  PRESERVED_FLAGS.map((spec) => [spec.flag, spec]),
);

/**
 * Split `--flag=value` into its head/value parts. A bare `--flag` returns
 * `{ head, inlineValue: undefined }`.
 */
function splitInline(arg: string): { head: string; inlineValue?: string } {
  const eq = arg.indexOf("=");
  if (eq < 0) return { head: arg };
  return { head: arg.slice(0, eq), inlineValue: arg.slice(eq + 1) };
}

/**
 * Capture the preserved startup flags from argv. Reads only PRESERVED_FLAGS,
 * ignoring the node/script head and every unknown arg. Handles `--flag=value`,
 * `--flag value`, and boolean flags. Unknown/empty argv → `[]`.
 */
export function captureStartupFlags(argv: readonly string[]): CapturedFlag[] {
  const captured: CapturedFlag[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const { head, inlineValue } = splitInline(arg);
    const spec = SPEC_BY_FLAG.get(head);
    if (!spec) continue; // ignore node/script head + unknown args
    if (!spec.takesValue) {
      captured.push({ flag: spec.flag });
      continue;
    }
    if (inlineValue !== undefined) {
      captured.push({ flag: spec.flag, value: inlineValue });
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("-")) {
      captured.push({ flag: spec.flag, value: next });
      i++; // consume the value token
    } else {
      captured.push({ flag: spec.flag, value: "" });
    }
  }
  return captured;
}

/** Emit one captured flag as its argv token(s). */
function emitFlag(item: CapturedFlag): string[] {
  const spec = SPEC_BY_FLAG.get(item.flag);
  if (spec && !spec.takesValue) return [item.flag];
  return [item.flag, item.value ?? ""];
}

/**
 * Build the argv array to relaunch with: the preserved captured flags plus any
 * `extra` args, deduped by flag — a later explicit `extra` flag wins over a
 * captured one (so a relaunch can override a carried flag). A boolean flag is
 * emitted once. Unknown extra args (non-flags / positionals) pass through as-is.
 */
export function buildRelaunchArgv(
  captured: readonly CapturedFlag[],
  extra: readonly CapturedFlag[] = [],
): string[] {
  const byFlag = new Map<string, CapturedFlag>();
  for (const item of captured) byFlag.set(item.flag, item);
  for (const item of extra) byFlag.set(item.flag, item); // extra overrides captured
  const out: string[] = [];
  for (const item of byFlag.values()) out.push(...emitFlag(item));
  return out;
}

/** A readable display string of the captured flags, e.g. `--model gpt-4o --bare`. */
export function serializeFlags(captured: readonly CapturedFlag[]): string {
  return captured
    .map((item) => (item.value !== undefined ? `${item.flag} ${item.value}` : item.flag))
    .join(" ");
}
