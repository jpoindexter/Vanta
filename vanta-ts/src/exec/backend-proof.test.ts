import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildRemoteProofScript,
  manifestFixture,
  parseRemoteProof,
  validateRemoteProof,
} from "./backend-proof.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "vanta-backend-proof-"));
  roots.push(root);
  mkdirSync(join(root, "vanta-ts"));
  writeFileSync(join(root, "vanta-ts", "package.json"), '{"name":"vanta"}\n');
  return root;
}

describe("remote backend proof", () => {
  it("hashes the uploaded manifest and emits a nonce-bearing receipt", () => {
    const root = fixture();
    const manifest = manifestFixture(root)!;
    const output = execFileSync(process.execPath, ["-e", buildRemoteProofScript("nonce-1", manifest.relativePath)], {
      cwd: root,
      encoding: "utf8",
    });
    const proof = parseRemoteProof(`provider log\n${output}`)!;
    expect(proof).toMatchObject({ nonce: "nonce-1", manifestSha256: manifest.sha256 });
  });

  it("rejects a local or replayed receipt", () => {
    const proof = { nonce: "old", platform: "darwin", arch: "arm64", cwd: "/tmp", manifestSha256: "bad" };
    expect(validateRemoteProof(proof, { nonce: "new", manifestSha256: "good", provider: "modal" }))
      .toBe("remote proof nonce mismatch");
  });

  it("requires Modal to execute from the uploaded /workspace", () => {
    const proof = { nonce: "n", platform: "linux", arch: "x64", cwd: "/tmp", manifestSha256: "hash" };
    expect(validateRemoteProof(proof, { nonce: "n", manifestSha256: "hash", provider: "modal" }))
      .toBe("Modal proof ran in /tmp, expected /workspace");
  });
});
