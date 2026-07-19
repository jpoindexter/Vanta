import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { externalAccountStatus, proofHash, writeExternalAccountProof } from "./external-account-proof.js";

const roots: string[] = [];
const COMMIT = "a".repeat(40);

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-release-proofs-"));
  roots.push(root);
  await mkdir(join(root, "vanta-ts", "config"), { recursive: true });
  await writeFile(join(root, "vanta-ts", "config", "release-external-accounts.json"), JSON.stringify({
    version: 1,
    accounts: [
      { id: "codex", label: "Codex", kind: "model_provider", requiredAction: "completion" },
      { id: "google-workspace", label: "Google", kind: "data_provider", requiredAction: "search" },
      { id: "telegram", label: "Telegram", kind: "messaging_channel", requiredAction: "reply" },
    ],
  }));
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("external account release proof", () => {
  it("distinguishes catalog, configured, tested, and current-commit proof", async () => {
    const root = await workspace();
    const packet = {
      version: 1 as const,
      accountId: "google-workspace" as const,
      commit: "b".repeat(40),
      executedAt: "2026-07-19T08:00:00.000Z",
      configuredIdentityHash: proofHash("identity"),
      request: { kind: "gmail_search", hash: proofHash("request") },
      action: { kind: "read", ok: true as const },
      result: { kind: "messages", hash: proofHash("result") },
      recovery: { kind: "missing_auth", ok: true as const, nextAction: "Reconnect Google" },
    };
    await writeExternalAccountProof(root, packet);
    let status = await externalAccountStatus(root, COMMIT, { codex: true });
    expect(status.accounts.map((account) => account.stage)).toEqual(["configured", "tested", "catalog"]);

    await writeExternalAccountProof(root, { ...packet, commit: COMMIT });
    status = await externalAccountStatus(root, COMMIT, { codex: true });
    expect(status.accounts[1]?.stage).toBe("release_proven");
    expect(status.ready).toBe(false);
  });
});
