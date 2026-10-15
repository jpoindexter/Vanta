import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import dns from "node:dns";

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (orig) => ({ ...(await orig<typeof import("node:child_process")>()), spawn: spawnMock }));

import { checkPackage, guardLaunch, loadDenyList, parseDenyList, USER_DENY_LIST_FILE, type ListedEntry } from "./package-guard.js";
import { SHIPPED_DENY_LIST } from "./package-guard-default.js";
import { parsePackageLaunch } from "./package-spec.js";
import { stdioTransport } from "./client.js";
import { mountMcpServers } from "./mount.js";
import { connectServer } from "./connect.js";
import { buildMountMcpTool } from "../tools/mount-mcp.js";

let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-pkg-guard-"));
  env = { VANTA_HOME: home };
  // stdioTransport's backstop reads process.env; keep it off the machine's real home.
  vi.stubEnv("VANTA_HOME", home);
  spawnMock.mockReset();
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});

async function writeUserList(body: unknown): Promise<string> {
  const file = join(home, USER_DENY_LIST_FILE);
  await writeFile(file, typeof body === "string" ? body : JSON.stringify(body), "utf8");
  return file;
}

const USER_LIST = {
  version: 1,
  packages: [
    { ecosystem: "npm", name: "vanta-fake-evil-mcp", reason: "test entry" },
    { ecosystem: "npm", name: "@acme/Bad-Scope", versions: ["2.0.0"], reason: "bad release" },
    { ecosystem: "pypi", name: "Fake_Evil.Py", reason: "test pypi entry" },
  ],
};

describe("shipped deny-list", () => {
  it("is valid against the schema and covers both ecosystems", () => {
    const parsed = parseDenyList(JSON.stringify(SHIPPED_DENY_LIST), "shipped");
    expect(parsed.ok).toBe(true);
    const ecosystems = new Set(SHIPPED_DENY_LIST.packages.map((p) => p.ecosystem));
    expect(ecosystems).toEqual(new Set(["npm", "pypi"]));
  });

  it("refuses a shipped entry with no user file present", () => {
    const guard = guardLaunch("npx", ["-y", "postmark-mcp"], env);
    expect(guard.ok).toBe(false);
  });

  it("denies only the listed versions of a version-scoped entry", () => {
    expect(guardLaunch("npx", ["ua-parser-js@0.7.29"], env).ok).toBe(false);
    expect(guardLaunch("npx", ["ua-parser-js@0.7.30"], env).ok).toBe(true);
    expect(guardLaunch("npx", ["ua-parser-js"], env).ok).toBe(true);
  });
});

describe("checkPackage", () => {
  const entries: ListedEntry[] = [
    { ecosystem: "npm", name: "bad", reason: "r", source: "user", file: "f" },
  ];

  it("returns ok for an unlisted package", () => {
    expect(checkPackage(parsePackageLaunch("npx", ["good"])[0]!, entries)).toEqual({ ok: true });
  });

  it("returns the matched entry and a reason naming the package", () => {
    const verdict = checkPackage(parsePackageLaunch("npx", ["bad@1.0.0"])[0]!, entries);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.matched.reason).toBe("r");
      expect(verdict.reason).toContain('"bad@1.0.0"');
    }
  });

  it("does not match the same name in the other ecosystem", () => {
    expect(checkPackage(parsePackageLaunch("uvx", ["bad"])[0]!, entries).ok).toBe(true);
  });
});

describe("user list", () => {
  it("merges with the shipped list", async () => {
    await writeUserList(USER_LIST);
    const list = loadDenyList(env);
    expect(list.ok && list.entries.some((e) => e.source === "shipped")).toBe(true);
    expect(list.ok && list.entries.some((e) => e.source === "user")).toBe(true);
    expect(guardLaunch("npx", ["vanta-fake-evil-mcp"], env).ok).toBe(false);
    expect(guardLaunch("npx", ["postmark-mcp"], env).ok).toBe(false);
  });

  it("matches scoped npm names case-insensitively and pypi names by PEP 503 normalization", async () => {
    await writeUserList(USER_LIST);
    expect(guardLaunch("npx", ["@acme/bad-scope@2.0.0"], env).ok).toBe(false);
    expect(guardLaunch("npx", ["@acme/bad-scope@2.0.1"], env).ok).toBe(true);
    expect(guardLaunch("uvx", ["fake-evil-py==1.0"], env).ok).toBe(false);
    expect(guardLaunch("uvx", ["FAKE.EVIL_PY"], env).ok).toBe(false);
  });

  it("names the package, the entry reason and the user file in the refusal", async () => {
    const file = await writeUserList(USER_LIST);
    const guard = guardLaunch("npx", ["-y", "vanta-fake-evil-mcp"], env);
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.error).toContain("vanta-fake-evil-mcp");
      expect(guard.error).toContain("test entry");
      expect(guard.error).toContain(file);
      expect(guard.error).toContain("cannot be approved");
    }
  });

  it("points a shipped-entry refusal at the owner's file", () => {
    const guard = guardLaunch("npx", ["crossenv"], env);
    expect(!guard.ok && guard.error).toContain(join(home, USER_DENY_LIST_FILE));
  });

  it("fails with an actionable error when the file is not valid JSON", async () => {
    const file = await writeUserList("{ not json");
    const guard = guardLaunch("npx", ["clean-pkg"], env);
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.error).toContain(file);
      expect(guard.error).toContain("not valid JSON");
      expect(guard.error).toContain("delete the file");
    }
  });

  it("fails with the failing field path when the shape is wrong", async () => {
    await writeUserList({ version: 1, packages: [{ ecosystem: "cargo", name: "x", reason: "r" }] });
    const guard = guardLaunch("uvx", ["clean-pkg"], env);
    expect(!guard.ok && guard.error).toContain("packages.0.ecosystem");
  });

  it("ignores a malformed file for launches that do not fetch a package", async () => {
    await writeUserList("{ not json");
    expect(guardLaunch("node", ["server.js"], env)).toEqual({ ok: true, packages: [] });
  });
});

describe("no network", () => {
  it("makes no fetch, http(s), net or dns call on the check path", async () => {
    const boom = () => { throw new Error("network used"); };
    const fetchStub = vi.fn(boom);
    vi.stubGlobal("fetch", fetchStub);
    const spies = [
      vi.spyOn(http, "request").mockImplementation(boom),
      vi.spyOn(http, "get").mockImplementation(boom),
      vi.spyOn(https, "request").mockImplementation(boom),
      vi.spyOn(https, "get").mockImplementation(boom),
      vi.spyOn(net, "connect").mockImplementation(boom),
      vi.spyOn(net, "createConnection").mockImplementation(boom),
      vi.spyOn(dns, "lookup").mockImplementation(boom),
    ];
    await writeUserList(USER_LIST);
    expect(guardLaunch("npx", ["vanta-fake-evil-mcp"], env).ok).toBe(false);
    expect(guardLaunch("uvx", ["clean-pkg@latest"], env).ok).toBe(true);
    expect(guardLaunch("pnpm", ["dlx", "@scope/clean"], env).ok).toBe(true);
    expect(fetchStub).not.toHaveBeenCalled();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("launch wiring", () => {
  it("stdioTransport refuses a shipped denied package before spawn", () => {
    expect(() => stdioTransport("npx", ["-y", "postmark-mcp"], {})).toThrow(/postmark-mcp/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("stdioTransport spawns a clean package", () => {
    spawnMock.mockReturnValue({ stdin: null, stdout: null, stderr: null, on: vi.fn(), kill: vi.fn() });
    stdioTransport("npx", ["-y", "some-clean-mcp@1.0.0"], {});
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0]?.[0]).toBe("npx");
  });

  it("mount refuses a user-denied package before the trust prompt and before spawn", async () => {
    await writeUserList(USER_LIST);
    const confirm = vi.fn(async () => true);
    const logs: string[] = [];
    const cwd = await mkdtemp(join(tmpdir(), "vanta-pkg-guard-cwd-"));
    const mountEnv = { ...env, VANTA_MCP_SERVERS: JSON.stringify({ servers: { evil: { command: "npx", args: ["-y", "vanta-fake-evil-mcp"] } } }) };
    const result = await mountMcpServers({ register: vi.fn() } as never, mountEnv, (m) => logs.push(m), { cwd, trust: { root: cwd, confirm } });
    await rm(cwd, { recursive: true, force: true });
    expect(result.servers).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("vanta-fake-evil-mcp");
    expect(logs.join("\n")).toContain("cannot be approved");
  });

  it("connect returns an error view naming the package and never spawns", async () => {
    await writeUserList(USER_LIST);
    const view = await connectServer("evil", { command: "uvx", args: ["fake-evil-py"] }, { env, root: home });
    expect(view.status).toBe("error");
    expect(view.error).toContain("fake-evil-py");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("the model-facing mount_mcp tool refuses a denied package before any effect", async () => {
    await writeUserList(USER_LIST);
    const tool = buildMountMcpTool({ register: vi.fn() } as never);
    const out = await tool.execute({ name: "evil", command: "npx", args: ["vanta-fake-evil-mcp"] }, { root: home } as never);
    expect(out.ok).toBe(false);
    expect(out.output).toContain("vanta-fake-evil-mcp");
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
