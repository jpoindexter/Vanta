import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseTokenFile,
  hasGoogleAuth,
  getAccessToken,
  readApiToken,
} from "./auth.js";
import { runAuthCommand } from "./commands.js";

const NOT_AUTH = "Google not authorized — run: vanta auth google";

describe("parseTokenFile", () => {
  it("accepts a well-formed token object", () => {
    const parsed = parseTokenFile({
      refresh_token: "r",
      access_token: "a",
      expiry_date: 123,
    });
    expect(parsed).toMatchObject({ refresh_token: "r", access_token: "a" });
  });

  it("accepts an object with only a refresh_token", () => {
    expect(parseTokenFile({ refresh_token: "r" })).toEqual({
      refresh_token: "r",
    });
  });

  it("returns null for non-object garbage", () => {
    expect(parseTokenFile("nope")).toBeNull();
    expect(parseTokenFile(42)).toBeNull();
    expect(parseTokenFile(null)).toBeNull();
    expect(parseTokenFile(undefined)).toBeNull();
  });

  it("rejects wrong field types", () => {
    expect(parseTokenFile({ refresh_token: 123 })).toBeNull();
    expect(parseTokenFile({ expiry_date: "soon" })).toBeNull();
  });
});

describe("token file persistence", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-auth-"));
    env = { VANTA_HOME: home };
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  async function writeTokens(obj: unknown): Promise<void> {
    await mkdir(home, { recursive: true });
    await writeFile(
      join(home, "google-tokens.json"),
      JSON.stringify(obj),
      "utf8",
    );
  }

  it("hasGoogleAuth is true when a token file with refresh_token exists", async () => {
    await writeTokens({ refresh_token: "r", access_token: "a" });
    expect(await hasGoogleAuth(env)).toBe(true);
  });

  it("hasGoogleAuth is false when the token file is absent", async () => {
    expect(await hasGoogleAuth(env)).toBe(false);
  });

  it("hasGoogleAuth is false when the file lacks a refresh_token", async () => {
    await writeTokens({ access_token: "a" });
    expect(await hasGoogleAuth(env)).toBe(false);
  });

  it("hasGoogleAuth is false for a corrupt token file", async () => {
    await mkdir(home, { recursive: true });
    await writeFile(join(home, "google-tokens.json"), "{not json", "utf8");
    expect(await hasGoogleAuth(env)).toBe(false);
  });

  it("getAccessToken throws the actionable error when no token file exists", async () => {
    await expect(getAccessToken(env)).rejects.toThrow(NOT_AUTH);
  });

  it("getAccessToken throws the actionable error when refresh_token is missing", async () => {
    await writeTokens({ access_token: "a" });
    await expect(getAccessToken(env)).rejects.toThrow(NOT_AUTH);
  });
});

describe("runAuthCommand", () => {
  it("exits 1 and prints usage when subcommand is not google", async () => {
    const code = await runAuthCommand(["slack"]);
    expect(code).toBe(1);
  });

  it("exits 1 when client credentials are missing (throws before opening loopback)", async () => {
    // Empty env = no VANTA_GOOGLE_CLIENT_ID/SECRET → credential check fires
    // before awaitLoopbackCode() is reached, so no localhost TCP bind needed.
    const code = await runAuthCommand(["google"], {});
    expect(code).toBe(1);
  });
});

describe("readApiToken", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-token-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds the token in VANTA_ROOT/.vanta/api-token", async () => {
    await mkdir(join(dir, ".vanta"), { recursive: true });
    await writeFile(join(dir, ".vanta", "api-token"), "tok-abc\n", "utf8");
    expect(await readApiToken({ VANTA_ROOT: dir })).toBe("tok-abc");
  });

  it("walks up to an ancestor's .vanta/api-token (cwd differs from repo root)", async () => {
    await mkdir(join(dir, ".vanta"), { recursive: true });
    await writeFile(join(dir, ".vanta", "api-token"), "tok-root", "utf8");
    const nested = join(dir, "vanta-ts", "src");
    await mkdir(nested, { recursive: true });
    expect(await readApiToken({ VANTA_ROOT: nested })).toBe("tok-root");
  });

  it("returns null when no api-token exists in the tree", async () => {
    expect(await readApiToken({ VANTA_ROOT: dir })).toBeNull();
  });
});
