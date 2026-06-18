// Lightweight notifications so you can leave Vanta running and know when it needs
// you: a terminal bell (always) + an optional macOS desktop notification (opt-in
// via VANTA_NOTIFY=1). Pure surface (injectable writer/env) for testing.

import { fireHooks } from "../hooks/shell-hooks.js";

const BELL = "\x07";
const DEFAULT_THRESHOLD_MS = 10_000;

/** Only ping for turns long enough that you've likely looked away. */
export function shouldNotify(elapsedMs: number, thresholdMs = DEFAULT_THRESHOLD_MS): boolean {
  return elapsedMs >= thresholdMs;
}

type NotifyOpts = {
  title: string;
  message: string;
  bell?: boolean;
  env?: NodeJS.ProcessEnv;
  write?: (s: string) => void;
  dataDir?: string;
  cwd?: string;
  notificationType?: string;
};

/** Ring the terminal bell and (if VANTA_NOTIFY is on) post a desktop notification. */
export function notify(opts: NotifyOpts): void {
  const env = opts.env ?? process.env;
  const write = opts.write ?? ((s: string) => void process.stdout.write(s));
  if (opts.bell !== false) write(BELL);
  if (opts.dataDir) {
    const type = opts.notificationType ?? "other";
    void fireHooks(opts.dataDir, "Notification", { type, title: opts.title, message: opts.message }, { cwd: opts.cwd, matcherValue: type });
  }
  if (env.VANTA_NOTIFY === "1" || env.VANTA_NOTIFY === "true") {
    void import("node:child_process")
      .then(({ execFile }) => {
        execFile(
          "osascript",
          ["-e", `display notification ${JSON.stringify(opts.message)} with title ${JSON.stringify(opts.title)}`],
          () => {},
        );
      })
      .catch(() => {});
  }
}
