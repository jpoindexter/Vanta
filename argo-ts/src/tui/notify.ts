// Lightweight notifications so you can leave Argo running and know when it needs
// you: a terminal bell (always) + an optional macOS desktop notification (opt-in
// via ARGO_NOTIFY=1). Pure surface (injectable writer/env) for testing.

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
};

/** Ring the terminal bell and (if ARGO_NOTIFY is on) post a desktop notification. */
export function notify(opts: NotifyOpts): void {
  const env = opts.env ?? process.env;
  const write = opts.write ?? ((s: string) => void process.stdout.write(s));
  if (opts.bell !== false) write(BELL);
  if (env.ARGO_NOTIFY === "1" || env.ARGO_NOTIFY === "true") {
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
