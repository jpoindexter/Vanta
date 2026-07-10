import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ServerlessProvider } from "./serverless.js";

const PROOF_PREFIX = "VANTA_REMOTE_PROOF ";
const MANIFEST_CANDIDATES = [
  "vanta-ts/package.json",
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "README.md",
  ".gitignore",
];

export type ManifestFixture = { relativePath: string; sha256: string };
export type RemoteBackendProof = {
  nonce: string;
  platform: string;
  arch: string;
  cwd: string;
  manifestSha256: string;
};

export function manifestFixture(root: string): ManifestFixture | null {
  for (const relativePath of MANIFEST_CANDIDATES) {
    try {
      const bytes = readFileSync(join(root, relativePath));
      return { relativePath, sha256: createHash("sha256").update(bytes).digest("hex") };
    } catch {
      // Try the next supported workspace layout.
    }
  }
  return null;
}

export function buildRemoteProofScript(nonce: string, relativePath: string): string {
  return [
    'const fs=require("node:fs"),crypto=require("node:crypto");',
    `const bytes=fs.readFileSync(${JSON.stringify(relativePath)});`,
    `const proof={nonce:${JSON.stringify(nonce)},platform:process.platform,arch:process.arch,cwd:process.cwd(),manifestSha256:crypto.createHash("sha256").update(bytes).digest("hex")};`,
    `console.log(${JSON.stringify(PROOF_PREFIX)}+JSON.stringify(proof));`,
  ].join("");
}

function isProof(value: unknown): value is RemoteBackendProof {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return ["nonce", "platform", "arch", "cwd", "manifestSha256"]
    .every((key) => typeof rec[key] === "string");
}

export function parseRemoteProof(output: string): RemoteBackendProof | null {
  for (const line of output.split("\n").reverse()) {
    const index = line.indexOf(PROOF_PREFIX);
    if (index < 0) continue;
    try {
      const parsed: unknown = JSON.parse(line.slice(index + PROOF_PREFIX.length));
      if (isProof(parsed)) return parsed;
    } catch {
      // Ignore non-proof provider logs.
    }
  }
  return null;
}

export function validateRemoteProof(
  proof: RemoteBackendProof,
  expected: { nonce: string; manifestSha256: string; provider: ServerlessProvider },
): string | null {
  if (proof.nonce !== expected.nonce) return "remote proof nonce mismatch";
  if (proof.manifestSha256 !== expected.manifestSha256) return "remote workspace manifest hash mismatch";
  if (proof.platform !== "linux") return `remote proof ran on ${proof.platform}, expected linux`;
  if (expected.provider === "modal" && proof.cwd !== "/workspace") {
    return `Modal proof ran in ${proof.cwd}, expected /workspace`;
  }
  return null;
}
