import type { RunAnywhereReadiness } from "../run-anywhere/readiness.js";

async function printWithOptionalRelease(
  output: object,
  text: string,
  rest: string[],
  exitCode: (releaseOk?: boolean) => number,
): Promise<number> {
  if (!rest.includes("--check-release")) {
    console.log(rest.includes("--json") ? JSON.stringify(output, null, 2) : text);
    return exitCode();
  }
  const { fetchAndroidReleaseAssetStatus, formatReleaseAssetStatus } = await import("../run-anywhere/release-assets.js");
  const release = await fetchAndroidReleaseAssetStatus();
  console.log(rest.includes("--json") ? JSON.stringify({ ...output, release }, null, 2) : `${text}\n${formatReleaseAssetStatus(release)}`);
  return exitCode(release.ok);
}

function statusExit(readiness: RunAnywhereReadiness): (releaseOk?: boolean) => number {
  return (releaseOk) => readiness.ready && (releaseOk ?? true) ? 0 : 1;
}

function packetExit(): number {
  return 0;
}

export async function runRunAnywhereCommand(repoRoot: string, rest: string[]): Promise<number> {
  const command = rest[0] ?? "status";
  if (command !== "status" && command !== "proof-packet") {
    console.log("Usage: vanta run-anywhere status|proof-packet [--json] [--check-release]");
    return 1;
  }
  const {
    buildRunAnywhereProofPacket,
    formatRunAnywhereProofPacket,
    formatRunAnywhereReadiness,
    readRunAnywhereReadiness,
  } = await import("../run-anywhere/readiness.js");
  const readiness = await readRunAnywhereReadiness(repoRoot);
  if (command === "proof-packet") {
    const packet = buildRunAnywhereProofPacket(readiness);
    return printWithOptionalRelease(packet, formatRunAnywhereProofPacket(packet), rest, packetExit);
  }
  return printWithOptionalRelease(readiness, formatRunAnywhereReadiness(readiness), rest, statusExit(readiness));
}
