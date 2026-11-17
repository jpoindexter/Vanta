/** Opt-in startup timeline: VANTA_LAUNCH_TRACE=1 prints ms since process start per stage. */
export function markLaunch(stage: string, env: NodeJS.ProcessEnv = process.env): void {
  if (env.VANTA_LAUNCH_TRACE !== "1") return;
  process.stderr.write(`[launch] ${stage} +${Math.round(performance.now())}ms\n`);
}
