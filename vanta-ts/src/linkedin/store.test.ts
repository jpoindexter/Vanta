import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLinkedInCredential, parseLinkedInCredential, saveLinkedInCredential } from "./store.js";

const credential = {
  accessToken: "secret-access-token",
  clientId: "public-client-id",
  expiresAt: 2_000_000_000_000,
  scopes: ["w_member_social"],
  authorization: "member-posting" as const,
  source: "portal-token" as const,
};

describe("LinkedIn credential storage", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-linkedin-"));
    env = { VANTA_HOME: home };
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("atomically persists and reloads a 0600 credential file", async () => {
    await saveLinkedInCredential(credential, env);
    const path = join(home, "linkedin-tokens.json");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await expect(loadLinkedInCredential(env)).resolves.toEqual(credential);
    expect(await readFile(path, "utf8")).not.toContain("client_secret");
  });

  it("fails closed for malformed or corrupt stored data", async () => {
    expect(parseLinkedInCredential({ accessToken: 123 })).toBeNull();
    await writeFile(join(home, "linkedin-tokens.json"), "{bad json", "utf8");
    await expect(loadLinkedInCredential(env)).resolves.toBeNull();
  });
});
