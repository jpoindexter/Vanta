import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexProvider } from "../providers/codex.js";
import { loadCodexCreds } from "../providers/codex-auth.js";
import { discoverProviderModels } from "../providers/model-discovery.js";
import { getAccessToken } from "../google/auth.js";
import { gmailSearchTool } from "../tools/gmail.js";
import { probeMessaging } from "../setup/assistant.js";
import { resolveTelegramSetupStatus } from "../setup/telegram-status.js";
import { readChannelProofs } from "../gateway/channel-proof.js";
import {
  externalAccountStatus,
  configuredReleaseAccounts,
  currentReleaseCommit,
  proofHash,
  ReleaseAccountIdSchema,
  writeExternalAccountProof,
  type ExternalAccountProof,
  type ReleaseAccountId,
} from "../release/external-account-proof.js";

export const RELEASE_PROOFS_USAGE = "usage: vanta release-proofs status [--json] | capture codex|google-workspace|telegram|all --yes [--json]";
const PROOF_MARKER = "VANTA_EXTERNAL_ACCOUNT_PROOF_OK";

async function status(repoRoot: string, json: boolean): Promise<number> {
  const report = await externalAccountStatus(repoRoot, currentReleaseCommit(repoRoot), await configuredReleaseAccounts());
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`External account release proof: ${report.ready ? "ready" : "not ready"}`);
    for (const account of report.accounts) console.log(`${account.stage === "release_proven" ? "✓" : "○"} ${account.label} — ${account.stage.replace("_", " ")}`);
  }
  return report.ready ? 0 : 1;
}

async function recoveryHome(prefix: string, run: (home: string) => Promise<string>): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), prefix));
  try { return await run(home); }
  finally { await rm(home, { recursive: true, force: true }); }
}

async function captureCodex(repoRoot: string, commit: string): Promise<ExternalAccountProof> {
  const discovered = await discoverProviderModels("codex", process.env);
  if (discovered.source !== "live" || discovered.models.length === 0) throw new Error("Codex account entitlements unavailable. Run `codex login status` and refresh models.");
  const model = discovered.models[0]!;
  const creds = await loadCodexCreds();
  const provider = new CodexProvider({ model });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  let result: string;
  try {
    result = (await provider.complete([{ role: "user", content: `Reply with exactly ${PROOF_MARKER} and nothing else.` }], [], { maxTokens: 40, signal: controller.signal })).text.trim();
  } finally {
    clearTimeout(timeout);
  }
  if (result !== PROOF_MARKER) throw new Error("Codex completion did not return the release-proof marker.");
  const recovery = await recoveryHome("vanta-codex-recovery-", async (home) => {
    const missing = await discoverProviderModels("codex", { CODEX_HOME: home });
    if (!missing.error) throw new Error("Codex missing-account recovery did not surface an action.");
    return missing.error;
  });
  return {
    version: 1,
    accountId: "codex",
    commit,
    executedAt: new Date().toISOString(),
    configuredIdentityHash: proofHash(creds.accountId),
    request: { kind: "account_model_completion", hash: proofHash(`${model}:${PROOF_MARKER}`) },
    action: { kind: "completion", ok: true },
    result: { kind: "exact_marker", hash: proofHash(result) },
    recovery: { kind: "missing_account_cache", ok: true, nextAction: recovery },
    models: { source: "connected-account", ids: discovered.models },
  };
}

async function captureGoogle(commit: string): Promise<ExternalAccountProof> {
  const token = await getAccessToken(process.env);
  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!profileResponse.ok) throw new Error(`Google profile read failed (HTTP ${profileResponse.status}). Reconnect Google from Desktop.`);
  const profile = await profileResponse.json() as { emailAddress?: unknown };
  const email = typeof profile.emailAddress === "string" ? profile.emailAddress : "";
  if (!email) throw new Error("Google profile did not return a configured identity.");
  const query = "newer_than:30d";
  const result = await gmailSearchTool.execute({ query, max: 1 }, {} as never);
  if (!result.ok) throw new Error(result.output);
  const recovery = await recoveryHome("vanta-google-recovery-", async (home) => {
    try { await getAccessToken({ VANTA_HOME: home }); }
    catch (error) { return error instanceof Error ? error.message : String(error); }
    throw new Error("Google missing-auth recovery did not fail as expected.");
  });
  return {
    version: 1,
    accountId: "google-workspace",
    commit,
    executedAt: new Date().toISOString(),
    configuredIdentityHash: proofHash(email.toLowerCase()),
    request: { kind: "gmail_search", hash: proofHash(query) },
    action: { kind: "read_only_search", ok: true },
    result: { kind: "redacted_search_result", hash: proofHash(result.output) },
    recovery: { kind: "missing_google_auth", ok: true, nextAction: recovery },
  };
}

async function captureTelegram(repoRoot: string, commit: string): Promise<ExternalAccountProof> {
  const dataDir = join(repoRoot, ".vanta");
  const probe = await probeMessaging(process.env);
  if (!probe.ok) throw new Error(probe.detail);
  const live = await resolveTelegramSetupStatus(process.env, dataDir);
  if (live.state !== "polling_live" && live.state !== "webhook_live") throw new Error(`${live.title} ${live.action.command}`);
  const proofs = (await readChannelProofs(dataDir)).filter((proof) => proof.platform === "telegram");
  const latest = proofs.at(-1);
  const committedAt = Date.parse(execFileSync("git", ["show", "-s", "--format=%cI", commit], { cwd: repoRoot, encoding: "utf8" }).trim());
  if (!latest || Date.parse(latest.acceptedAt) < committedAt) {
    throw new Error(`No Telegram inbound-to-reply receipt exists after commit ${commit.slice(0, 8)}. Send a new message to the configured bot, then retry.`);
  }
  const recovery = await resolveTelegramSetupStatus({}, dataDir);
  if (recovery.state !== "unconfigured") throw new Error("Telegram missing-token recovery did not surface setup.");
  return {
    version: 1,
    accountId: "telegram",
    commit,
    executedAt: new Date().toISOString(),
    configuredIdentityHash: proofHash(probe.detail),
    request: { kind: "real_inbound_message", hash: proofHash(latest.inboundHash ?? latest.conversationHash) },
    action: { kind: "gateway_inbound_to_reply", ok: true },
    result: { kind: `accepted_${latest.parts}_part_reply`, hash: proofHash(latest.conversationHash) },
    recovery: { kind: "missing_bot_token", ok: true, nextAction: recovery.action.command },
    sourceAcceptedAt: latest.acceptedAt,
  };
}

async function capture(repoRoot: string, id: ReleaseAccountId): Promise<ExternalAccountProof> {
  const commit = currentReleaseCommit(repoRoot);
  if (id === "codex") return captureCodex(repoRoot, commit);
  if (id === "google-workspace") return captureGoogle(commit);
  return captureTelegram(repoRoot, commit);
}

export async function runReleaseProofsCommand(repoRoot: string, args: string[]): Promise<number> {
  const json = args.includes("--json");
  if (args[0] === "status") return status(repoRoot, json);
  if (args[0] !== "capture" || !args[1] || !args.includes("--yes")) {
    console.error(RELEASE_PROOFS_USAGE);
    return 1;
  }
  const parsedId = ReleaseAccountIdSchema.safeParse(args[1]);
  if (args[1] !== "all" && !parsedId.success) {
    console.error(RELEASE_PROOFS_USAGE);
    return 1;
  }
  const ids = args[1] === "all" ? ReleaseAccountIdSchema.options : [parsedId.data!];
  const written: Array<{ id: ReleaseAccountId; path: string }> = [];
  for (const id of ids) written.push({ id, path: await writeExternalAccountProof(repoRoot, await capture(repoRoot, id)) });
  if (json) console.log(JSON.stringify({ written }, null, 2));
  else for (const item of written) console.log(`✓ ${item.id} release proof recorded: ${item.path}`);
  return 0;
}
