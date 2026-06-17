export async function runHooksCommand(rest: string[]): Promise<void> {
  const { homedir } = await import("node:os");
  const { readFile, writeFile, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const settingsPath = join(homedir(), ".claude", "settings.json");
  const vantaCmd = join(homedir(), ".local", "bin", "vanta");
  if (rest[0] === "run") {
    const event = rest[1] ?? "stop";
    try {
      const { resolveBrain } = await import("../brain/index.js");
      const note = `\n- [${new Date().toISOString()}] hook: ${event}`;
      await resolveBrain().writeRegion("episodic", note, { append: true });
    } catch { /* best-effort */ }
    return;
  }
  if (rest[0] === "status") {
    try {
      const raw = await readFile(settingsPath, "utf8");
      const settings: Record<string, unknown> = JSON.parse(raw);
      const hooks = settings.hooks as Record<string, unknown> | undefined;
      console.log(`hooks.Stop:       ${hooks?.Stop ? "✓ configured" : "✗ not set"}`);
      console.log(`hooks.PreCompact: ${hooks?.PreCompact ? "✓ configured" : "✗ not set"}`);
    } catch {
      console.log("(~/.claude/settings.json not found or not readable)");
    }
    return;
  }
  await mkdir(join(homedir(), ".claude"), { recursive: true });
  let settings: Record<string, unknown> = {};
  try { settings = JSON.parse(await readFile(settingsPath, "utf8")); } catch { /* new file */ }
  const makeHook = (event: string) => [{
    matcher: "",
    hooks: [{ type: "command", command: `${vantaCmd} hooks run ${event} 2>/dev/null &` }],
  }];
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  hooks.Stop = makeHook("stop");
  hooks.PreCompact = makeHook("precompact");
  settings.hooks = hooks;
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  console.log(`✓ hooks installed in ${settingsPath}`);
  console.log("  Stop + PreCompact → vanta hooks run <event>");
}
