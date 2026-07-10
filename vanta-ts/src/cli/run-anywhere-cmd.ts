export async function runRunAnywhereCommand(repoRoot: string, rest: string[]): Promise<number> {
  const command = rest[0] ?? "status";
  if (command !== "status") {
    console.log("Usage: vanta run-anywhere status [--json] [--check-release]");
    return 1;
  }
  const { readRunAnywhereReadiness, formatRunAnywhereReadiness } = await import("../run-anywhere/readiness.js");
  const readiness = await readRunAnywhereReadiness(repoRoot);
  if (rest.includes("--check-release")) {
    const { fetchAndroidReleaseAssetStatus, formatReleaseAssetStatus } = await import("../run-anywhere/release-assets.js");
    const release = await fetchAndroidReleaseAssetStatus();
    console.log(rest.includes("--json") ? JSON.stringify({ ...readiness, release }, null, 2) : `${formatRunAnywhereReadiness(readiness)}\n${formatReleaseAssetStatus(release)}`);
    return readiness.ready && release.ok ? 0 : 1;
  }
  console.log(rest.includes("--json") ? JSON.stringify(readiness, null, 2) : formatRunAnywhereReadiness(readiness));
  return readiness.ready ? 0 : 1;
}
