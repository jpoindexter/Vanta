import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authenticatePublicApiToken, issuePublicApiToken,
  listPublicApiTokens, revokePublicApiToken,
} from "./auth.js";

let home: string;
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "vanta-api-auth-")); });
afterEach(async () => rm(home, { recursive: true, force: true }));

describe("public API tokens", () => {
  it("stores only a hash and authenticates the issued secret", async () => {
    const issued = await issuePublicApiToken(home, "CI client", 1_000);
    expect(issued.token).toMatch(/^vta_.{40,}$/);
    expect(await authenticatePublicApiToken(home, issued.token, 2_000)).toMatchObject({ id: issued.record.id, name: "CI client" });
    expect(await readFile(join(home, "public-api-tokens.json"), "utf8")).not.toContain(issued.token);
  });

  it("lists metadata and makes revocation immediate", async () => {
    const issued = await issuePublicApiToken(home, "Automation", 1_000);
    expect(await listPublicApiTokens(home)).toHaveLength(1);
    expect(await revokePublicApiToken(home, issued.record.id, 3_000)).toMatchObject({ revokedAt: new Date(3_000).toISOString() });
    expect(await authenticatePublicApiToken(home, issued.token, 4_000)).toBeNull();
  });
});
