/**
 * Opt-in launch timeline for the Electron main process (VANTA_LAUNCH_TRACE=1).
 * Each line carries wall-clock epoch ms so it aligns with the server child's
 * trace and the renderer's performance marks.
 */
export function createLaunchTrace({ env = process.env, now = Date.now, uptime = () => process.uptime(), write = (line) => process.stdout.write(line) } = {}) {
  const enabled = env.VANTA_LAUNCH_TRACE === "1";
  return (stage) => {
    if (enabled) write(`[launch:main] ${stage} epoch=${now()} up=${Math.round(uptime() * 1000)}\n`);
  };
}

/** Renderer performance marks as epoch ms, ready to print beside the main-process stages. */
export function formatRendererMarks(entries, timeOrigin) {
  return entries
    .filter((entry) => entry.name.startsWith("vanta:") || entry.name === "first-contentful-paint")
    .map((entry) => `[launch:renderer] ${entry.name.replace(/^vanta:/, "")} epoch=${Math.round(timeOrigin + entry.startTime)}`);
}

/** Trace mode: dump the renderer's performance marks (first render, composer, server-ready) after load. */
export async function printRendererMarks(window, write = (line) => process.stdout.write(line)) {
  if (!window || window.isDestroyed()) return;
  const raw = await window.webContents.executeJavaScript(
    "JSON.stringify({ origin: performance.timeOrigin, entries: [...performance.getEntriesByType('mark'), ...performance.getEntriesByType('paint')].map(({ name, startTime }) => ({ name, startTime })) })",
  ).catch(() => undefined);
  if (!raw) return;
  const { origin, entries } = JSON.parse(raw);
  for (const line of formatRendererMarks(entries, origin)) write(`${line}\n`);
}
