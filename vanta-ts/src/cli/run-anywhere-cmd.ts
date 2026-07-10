export async function runRunAnywhereCommand(repoRoot: string, rest: string[]): Promise<number> {
  const command = rest[0] ?? "status";
  if (command !== "status") {
    console.log("Usage: vanta run-anywhere status [--json]");
    return 1;
  }
  const { readRunAnywhereReadiness, formatRunAnywhereReadiness } = await import("../run-anywhere/readiness.js");
  const readiness = await readRunAnywhereReadiness(repoRoot);
  console.log(rest.includes("--json") ? JSON.stringify(readiness, null, 2) : formatRunAnywhereReadiness(readiness));
  return readiness.ready ? 0 : 1;
}
