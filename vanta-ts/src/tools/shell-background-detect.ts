// RELIABILITY-SHELL-BG-WEDGE — detect a foreground shell_cmd that would block the
// turn. The foreground exec path (shell-cmd.ts runLocal → promisify(execFile)) does
// not resolve until every inherited stdio pipe hits EOF, not when the direct child
// exits. A process backgrounded with '&' (or a never-exiting server) inherits the
// open pipe and holds it, so execFile blocks for the whole child lifetime — until the
// 30s timeout, which then orphans the daemon. Reproduced: `sleep 6 & echo $!` took
// 6014ms vs 7ms with stdio redirected. The fix is to steer these to background:true
// (the detached, unref'd spawnBackground path) instead of running them foreground.

/** Strip single/double-quoted substrings so a literal '&' inside a string or URL
 *  (e.g. `curl "http://x?a=1&b=2"`) isn't read as a background operator. Best-effort:
 *  an unbalanced quote leaves the tail, which only makes detection MORE conservative
 *  (refuse), and the refusal is recoverable (re-run with background:true). */
function stripQuoted(command: string): string {
  return command.replace(/'[^']*'/g, " ").replace(/"[^"]*"/g, " ");
}

/** True when '&' is used as a background control operator — vs '&&' (logical and),
 *  a redirection ('2>&1', '>&2', '&>file'), or a quoted literal. Backgrounding a
 *  child on the foreground path is the confirmed wedge. */
export function looksLikeBackgrounding(command: string): boolean {
  let s = stripQuoted(command);
  s = s.replace(/&&/g, " "); // logical AND, not backgrounding
  s = s.replace(/[0-9]*>&[0-9-]*/g, " "); // 2>&1, >&2, >&-
  s = s.replace(/&>>?/g, " "); // &>file, &>>file
  return s.includes("&");
}

// Known long-running servers/watchers that never return on their own. Run foreground
// they block until the 30s timeout (then orphan). Steer them to background instead.
const SERVER_PATTERNS: RegExp[] = [
  /\bhttp\.server\b/, // python -m http.server
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|watch)\b/,
  /\b(?:npm|pnpm|yarn|bun)\s+run\s+tauri\s+dev\b/,
  /\b(?:bun|cargo)\s+tauri\s+dev\b/,
  /\btauri\s+dev\b/,
  /\b(?:vite|next|nuxt|astro|remix|gatsby)\s+dev\b/,
  /\b(?:npx|bunx)\s+(?:serve|http-server|live-server|vite|nodemon)\b/,
  /\bpnpm\s+dlx\s+(?:serve|http-server|live-server|vite|nodemon)\b/,
  /\b(?:serve|http-server|live-server|nodemon)\b/,
  /\bphp\s+-S\b/,
  /\bflask\s+run\b/,
  /\b(?:uvicorn|gunicorn|daphne)\b/,
  /\brails\s+s(?:erver)?\b/,
  /\b(?:jekyll|hugo)\s+serve\b/,
  /\bwebpack(?:-dev-server)?\s+serve\b/,
  /\b(?:tail|watch)\s+-[a-z]*f/, // tail -f, watch -n (long-lived follows)
];

/** True when the command is a known never-exiting server/watcher. */
export function isLongRunningServer(command: string): boolean {
  const s = stripQuoted(command);
  return SERVER_PATTERNS.some((re) => re.test(s));
}

// Raw port-bind listeners not covered by the named dev-server list — a netcat/ncat
// listen or a socat TCP-LISTEN. These are the other way an agent starts something
// that binds a port and never returns on its own.
const LISTEN_PATTERNS: RegExp[] = [
  /\bn(?:et)?c(?:at)?\s+(?:-\w*\s+)*-\w*l/, // nc -l / ncat -l / nc -lk (listen)
  /\bsocat\b.*\bLISTEN\b/i, // socat TCP-LISTEN:8000,...
];

/** True when the command binds a port to listen (raw netcat/socat listener). */
export function looksLikeListenServer(command: string): boolean {
  const s = stripQuoted(command);
  return LISTEN_PATTERNS.some((re) => re.test(s));
}

/** A command whose intent is to start a LISTENING server — a named dev server
 *  (`http.server`, `npm run dev`, `serve`, …) or a raw port bind (`nc -l`, `socat
 *  LISTEN`). This is the class that has NO working path under the shell sandbox:
 *  background isn't sandboxed and a foreground bind is denied by the network. */
export function looksLikeServeIntent(command: string): boolean {
  return isLongRunningServer(command) || looksLikeListenServer(command);
}

/** A foreground command that should have been background:true — it would block the
 *  turn (and risk orphaning a daemon) on the execFile path. */
export function needsBackground(command: string): boolean {
  return looksLikeBackgrounding(command) || isLongRunningServer(command);
}
