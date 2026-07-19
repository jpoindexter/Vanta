import type http from "node:http";
import { configuredReleaseAccounts, currentReleaseCommit, externalAccountStatus } from "../release/external-account-proof.js";
import { sendJson } from "./handlers.js";

export async function handleDesktopReleaseProofs(repoRoot: string, res: http.ServerResponse): Promise<void> {
  const commit = currentReleaseCommit(repoRoot);
  sendJson(res, 200, await externalAccountStatus(repoRoot, commit, await configuredReleaseAccounts()));
}
