import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseTokenFile,
  hasGoogleAuth,
  getAccessToken,
  hasGoogleClient,
  readApiToken,
  resolveClientCreds,
  googleScopesFor,
  type buildClient,
} from "./auth.js";
import { runAuthCommand } from "./commands.js";
import { loadTokens, saveTokens } from "./auth-store.js";

const NOT_AUTH = "Google gmail not authorized — run: vanta auth google gmail";

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

describe("Google capability-scoped authority", () => {
  it("requests exactly one service scope per consent flow", () => {
    expect(googleScopesFor("gmail")).toEqual(["https://www.googleapis.com/auth/gmail.modify"]);
    expect(googleScopesFor("calendar")).toEqual(["https://www.googleapis.com/auth/calendar"]);
    expect(googleScopesFor("drive")).toEqual(["https://www.googleapis.com/auth/drive"]);
  });

  it("stores refresh tokens in separate service slots", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-auth-scopes-"));
    const env = { VANTA_HOME: home };
    try {
      await saveTokens({ refresh_token: "gmail-refresh" }, env, "gmail");
      expect(await loadTokens(env, "gmail")).toMatchObject({ refresh_token: "gmail-refresh" });
      expect(await loadTokens(env, "calendar")).toBeNull();
      expect(await loadTokens(env, "drive")).toBeNull();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
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
    // Gmail is the default service for backwards-compatible call sites, but
    // its authority is stored separately from Calendar and Drive.
    await writeFile(
      join(home, "google-tokens-gmail.json"),
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
    await writeFile(join(home, "google-tokens-gmail.json"), "{not json", "utf8");
    expect(await hasGoogleAuth(env)).toBe(false);
  });

  it("getAccessToken throws the actionable error when no token file exists", async () => {
    await expect(getAccessToken(env)).rejects.toThrow(NOT_AUTH);
  });

  it("getAccessToken throws the actionable error when refresh_token is missing", async () => {
    await writeTokens({ access_token: "a" });
    await expect(getAccessToken(env)).rejects.toThrow(NOT_AUTH);
  });

  it("ingests the client JSON once and reloads it after the download is removed", async () => {
    const download = join(home, "client_secret.json");
    await writeFile(download, JSON.stringify({
      installed: {
        client_id: "desktop-client-id",
        client_secret: "desktop-client-secret",
      },
    }));

    await expect(resolveClientCreds(download, env)).resolves.toEqual({
      clientId: "desktop-client-id",
      clientSecret: "desktop-client-secret",
    });
    await rm(download);

    await expect(resolveClientCreds(undefined, env)).resolves.toEqual({
      clientId: "desktop-client-id",
      clientSecret: "desktop-client-secret",
    });
    expect(await hasGoogleClient(env)).toBe(true);
    expect((await stat(join(home, "google-client.json"))).mode & 0o777).toBe(0o600);
  });

  it("refreshes with persisted client credentials and retains the refresh token", async () => {
    await writeTokens({ refresh_token: "refresh-token" });
    const download = join(home, "client_secret.json");
    await writeFile(download, JSON.stringify({
      installed: {
        client_id: "desktop-client-id",
        client_secret: "desktop-client-secret",
      },
    }));
    await resolveClientCreds(download, env);
    await rm(download);

    const credentials: Record<string, unknown> = {};
    const client = {
      credentials,
      setCredentials: vi.fn((next: Record<string, unknown>) => Object.assign(credentials, next)),
      getAccessToken: vi.fn(async () => {
        Object.assign(credentials, { access_token: "fresh-access", expiry_date: 456 });
        return { token: "fresh-access" };
      }),
    };
    const clientFactory = vi.fn(async (_redirectUri, creds) => {
      expect(creds).toEqual({
        clientId: "desktop-client-id",
        clientSecret: "desktop-client-secret",
      });
      return client;
    }) as unknown as typeof buildClient;

    await expect(getAccessToken(env, clientFactory)).resolves.toBe("fresh-access");
    expect(client.setCredentials).toHaveBeenCalledWith({ refresh_token: "refresh-token" });
    expect(JSON.parse(await readFile(join(home, "google-tokens-gmail.json"), "utf8"))).toMatchObject({
      refresh_token: "refresh-token",
      access_token: "fresh-access",
      expiry_date: 456,
    });
  });

  it("names both setup routes when authorization exists but client credentials do not", async () => {
    await writeTokens({ refresh_token: "refresh-token" });
    await expect(getAccessToken(env)).rejects.toThrow("vanta auth google gmail --client <client_secret.json>");
    await expect(getAccessToken(env)).rejects.toThrow("connect Google from Vanta Desktop");
  });
});

describe("runAuthCommand", () => {
  it("exits 1 and prints usage when subcommand is not google", async () => {
    const code = await runAuthCommand(["slack"]);
    expect(code).toBe(1);
  });

  it("exits 1 when client credentials are missing (throws before opening loopback)", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-auth-command-"));
    try {
      const code = await runAuthCommand(["google"], { VANTA_HOME: home });
      expect(code).toBe(1);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
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
