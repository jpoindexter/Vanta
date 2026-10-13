/** First-occurrence performance marks for the launch timeline (read by the main process in trace mode). */
export function markLaunch(name: string): void {
  try {
    const mark = `vanta:${name}`;
    if (performance.getEntriesByName(mark).length === 0) performance.mark(mark);
  } catch {
    // Marks are diagnostics only; never let them affect the UI.
  }
}
