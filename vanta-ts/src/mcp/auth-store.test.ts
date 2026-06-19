import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import { parseMcpTokenStore, loadAllMcpTokens, loadMcpToken, saveMcpToken } from "./auth-store.js";

let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-mcp-auth-"));
  env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("parseMcpTokenStore (pure)", () => {
  it("parses a valid per-server store", () => {
    const store = parseMcpTokenStore({ github: { access_token: "t", refresh_token: "r" } });
    expect(store.github?.access_token).toBe("t");
  });

  it("returns an empty store for non-object / malformed input", () => {
    expect(parseMcpTokenStore(null)).toEqual({});
    expect(parseMcpTokenStore(42)).toEqual({});
    expect(parseMcpTokenStore({ github: { access_token: 123 } })).toEqual({});
  });
});

describe("token store IO", () => {
  it("returns null/empty when no store file exists", async () => {
    expect(await loadAllMcpTokens(env)).toEqual({});
    expect(await loadMcpToken("github", env)).toBeNull();
  });

  it("saves and reads back a server token, merging across servers", async () => {
    await saveMcpToken("github", { access_token: "gh" }, env);
    await saveMcpToken("zapier", { access_token: "zp" }, env);
    expect((await loadMcpToken("github", env))?.access_token).toBe("gh");
    expect((await loadMcpToken("zapier", env))?.access_token).toBe("zp");
    const all = await loadAllMcpTokens(env);
    expect(Object.keys(all).sort()).toEqual(["github", "zapier"]);
  });

  it("writes the token file with 0600 perms (POSIX)", async () => {
    if (platform() === "win32") return; // mode bits are POSIX-only
    await saveMcpToken("github", { access_token: "secret" }, env);
    const s = await stat(join(home, "mcp-auth-tokens.json"));
    expect(s.mode & 0o777).toBe(0o600);
  });
});
