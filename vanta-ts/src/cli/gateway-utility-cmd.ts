import { join } from "node:path";

const STATUS_STALE_MS = 180_000;

async function showGatewayStatus(repoRoot: string, rest: string[]): Promise<void> {
  const { readGatewayReadiness } = await import("../gateway/readiness-state.js");
  const snapshot = await readGatewayReadiness(join(repoRoot, ".vanta"));
  const ageMs = snapshot ? Math.max(0, Date.now() - Date.parse(snapshot.updatedAt)) : null;
  const state = !snapshot ? "idle" : ageMs! > STATUS_STALE_MS ? "stale" : "live";
  const report = {
    state,
    updatedAt: snapshot?.updatedAt,
    ageSeconds: ageMs === null ? null : Math.round(ageMs / 1000),
    channels: snapshot?.channels ?? [],
  };
  if (rest.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const channels = report.channels.length
    ? report.channels.map((channel) => `${channel.id}:${channel.status}`).join(" · ")
    : "no channel health recorded";
  console.log(`gateway ${state}${report.ageSeconds === null ? "" : ` · updated ${report.ageSeconds}s ago`} · ${channels}`);
}

async function showChannelProofs(repoRoot: string, rest: string[]): Promise<void> {
  const { readChannelProofs, formatChannelProofs } = await import("../gateway/channel-proof.js");
  const json = rest.includes("--json");
  const platform = rest.slice(1).find((arg) => !arg.startsWith("--"));
  const proofs = await readChannelProofs(join(repoRoot, ".vanta"));
  const selected = platform ? proofs.filter((proof) => proof.platform === platform) : proofs;
  console.log(json ? JSON.stringify(selected, null, 2) : formatChannelProofs(proofs, platform));
}

async function verifyChannels(repoRoot: string, rest: string[]): Promise<void> {
  const json = rest.includes("--json");
  const timeoutIdx = rest.indexOf("--timeout-ms");
  let timeoutMs: number | undefined;
  if (timeoutIdx >= 0) {
    const raw = rest[timeoutIdx + 1];
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      console.error("usage: vanta gateway verify-channels [--json] [--timeout-ms N]");
      return;
    }
    timeoutMs = parsed;
  }
  const { verifyMessagingChannels, formatChannelVerifyReport } = await import("../gateway/channel-verify.js");
  const report = await verifyMessagingChannels({ dataDir: join(repoRoot, ".vanta"), timeoutMs });
  console.log(json ? JSON.stringify(report, null, 2) : formatChannelVerifyReport(report));
}

/** Handle finite gateway utility commands. False means start the daemon. */
export async function runGatewayUtilityCommand(repoRoot: string, rest: string[]): Promise<boolean> {
  if (rest[0] === "status") {
    await showGatewayStatus(repoRoot, rest);
    return true;
  }
  if (rest[0] === "channel-proofs") {
    await showChannelProofs(repoRoot, rest);
    return true;
  }
  if (rest[0] === "verify-channels") {
    await verifyChannels(repoRoot, rest);
    return true;
  }
  if (rest.length > 0) {
    console.error("usage: vanta gateway [status [--json]|verify-channels [--json]|channel-proofs [platform] [--json]]");
    return true;
  }
  return false;
}
