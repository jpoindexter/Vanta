import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const ReleaseAccountIdSchema = z.enum(["codex", "google-workspace", "telegram"]);
export type ReleaseAccountId = z.infer<typeof ReleaseAccountIdSchema>;

const ManifestSchema = z.object({
  version: z.literal(1),
  accounts: z.array(z.object({
    id: ReleaseAccountIdSchema,
    label: z.string().min(1),
    kind: z.enum(["model_provider", "data_provider", "messaging_channel"]),
    requiredAction: z.string().min(1),
  })),
});

export const ExternalAccountProofSchema = z.object({
  version: z.literal(1),
  accountId: ReleaseAccountIdSchema,
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  executedAt: z.string().datetime(),
  configuredIdentityHash: z.string().regex(/^[0-9a-f]{64}$/),
  request: z.object({ kind: z.string().min(1), hash: z.string().regex(/^[0-9a-f]{64}$/) }),
  action: z.object({ kind: z.string().min(1), ok: z.literal(true) }),
  result: z.object({ kind: z.string().min(1), hash: z.string().regex(/^[0-9a-f]{64}$/) }),
  recovery: z.object({ kind: z.string().min(1), ok: z.literal(true), nextAction: z.string().min(1) }),
  models: z.object({ source: z.literal("connected-account"), ids: z.array(z.string().min(1)).min(1) }).optional(),
  sourceAcceptedAt: z.string().datetime().optional(),
});
export type ExternalAccountProof = z.infer<typeof ExternalAccountProofSchema>;
export type ExternalAccountStage = "catalog" | "configured" | "tested" | "release_proven";

export type ExternalAccountStatus = {
  id: ReleaseAccountId;
  label: string;
  kind: string;
  requiredAction: string;
  stage: ExternalAccountStage;
  proofCommit?: string;
  executedAt?: string;
};

export function proofHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function externalAccountProofDir(repoRoot: string): string {
  return join(repoRoot, ".vanta", "release-proofs", "external-accounts");
}

export async function readReleaseAccountManifest(repoRoot: string) {
  const path = join(repoRoot, "vanta-ts", "config", "release-external-accounts.json");
  return ManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export async function readExternalAccountProof(repoRoot: string, id: ReleaseAccountId): Promise<ExternalAccountProof | null> {
  try {
    return ExternalAccountProofSchema.parse(JSON.parse(await readFile(join(externalAccountProofDir(repoRoot), `${id}.json`), "utf8")));
  } catch {
    return null;
  }
}

export async function writeExternalAccountProof(repoRoot: string, proof: ExternalAccountProof): Promise<string> {
  const parsed = ExternalAccountProofSchema.parse(proof);
  const dir = externalAccountProofDir(repoRoot);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${parsed.accountId}.json`);
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return path;
}

export async function externalAccountStatus(
  repoRoot: string,
  commit: string,
  configured: Partial<Record<ReleaseAccountId, boolean>>,
): Promise<{ commit: string; ready: boolean; accounts: ExternalAccountStatus[] }> {
  const manifest = await readReleaseAccountManifest(repoRoot);
  const accounts = await Promise.all(manifest.accounts.map(async (account): Promise<ExternalAccountStatus> => {
    const proof = await readExternalAccountProof(repoRoot, account.id);
    const stage: ExternalAccountStage = proof?.commit === commit
      ? "release_proven"
      : proof
        ? "tested"
        : configured[account.id]
          ? "configured"
          : "catalog";
    return {
      ...account,
      stage,
      ...(proof ? { proofCommit: proof.commit, executedAt: proof.executedAt } : {}),
    };
  }));
  return { commit, ready: accounts.every((account) => account.stage === "release_proven"), accounts };
}
