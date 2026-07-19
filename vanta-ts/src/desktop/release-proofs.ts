import type http from "node:http";
import { configuredReleaseAccounts, currentReleaseCommit, externalAccountStatus } from "../release/external-account-proof.js";
import { sendJson } from "./handlers.js";

export async function handleDesktopReleaseProofs(repoRoot: string, res: http.ServerResponse): Promise<void> {
  try {
    const commit = currentReleaseCommit(repoRoot);
    sendJson(res, 200, await externalAccountStatus(repoRoot, commit, await configuredReleaseAccounts()));
  } catch {
    // Desktop projects are not necessarily Git worktrees, so release evidence is unavailable rather than an app error.
    sendJson(res, 200, { commit: "unavailable", ready: false, accounts: [] });
  }
}
