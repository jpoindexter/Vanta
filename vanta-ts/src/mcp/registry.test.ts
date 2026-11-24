import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendMcpReceipt,
  readMcpReceipts,
  readMcpRegistry,
  recordMcpProbe,
  setMcpConnectorEnabled,
  setMcpConnectorTrust,
} from "./registry.js";
import { saveMcpToken } from "./auth-store.js";

describe("project MCP connector registry", () => {
  let root: string;
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-mcp-registry-"));
    home = join(root, "home");
    await mkdir(home, { recursive: true });
    env = { VANTA_HOME: home };
    await writeFile(join(root, ".mcp.json"), JSON.stringify({
      mcpServers: {
        local: { command: "node", args: ["server.js"] },
        remote: {
          url: "https://mcp.example.test/api",
          authorizationUrl: "https://auth.example.test/authorize",
          tokenUrl: "https://auth.example.test/token",
          clientId: "vanta",
        },
      },
    }));
  });

  it("composes source, trust, auth, enablement, health, tools, and resources", async () => {
    await setMcpConnectorTrust(root, "local", true);
    await recordMcpProbe(root, "local", { ok: true, tools: ["read"], resources: ["docs://one"] }, new Date("2026-07-17T00:00:00Z"));

    expect(await readMcpRegistry(root, env)).toEqual([
      expect.objectContaining({ name: "local", source: "project", trust: "trusted", auth: "not_required", enabled: true, health: "ready", tools: ["read"], resources: ["docs://one"] }),
      expect.objectContaining({ name: "remote", source: "project", trust: "pending", auth: "needs_auth", health: "needs_setup" }),
    ]);
  });

  it("does not advertise stale probe tools after config narrows to explicit-empty", async () => {
    await recordMcpProbe(root, "local", {
      ok: true,
      tools: ["read", "write"],
      resources: [],
    });
    await writeFile(join(root, ".mcp.json"), JSON.stringify({
      mcpServers: { local: { command: "node", args: ["server.js"], tools: [] } },
    }));

    expect((await readMcpRegistry(root, env))[0]?.tools).toEqual([]);
  });

  it("uses the shared settings and trust stores for operator changes", async () => {
    await setMcpConnectorEnabled(root, "local", false);
    await setMcpConnectorTrust(root, "local", false);
    expect((await readMcpRegistry(root, env))[0]).toMatchObject({ enabled: false, trust: "denied", health: "disabled" });

    await setMcpConnectorEnabled(root, "local", true);
    await setMcpConnectorTrust(root, "local", true);
    expect((await readMcpRegistry(root, env))[0]).toMatchObject({ enabled: true, trust: "trusted", health: "needs_setup" });
  });

  it("moves remote OAuth connectors from needs auth to ready-to-test without exposing the token", async () => {
    await setMcpConnectorTrust(root, "remote", true);
    expect((await readMcpRegistry(root, env))[1]).toMatchObject({ auth: "needs_auth", health: "needs_setup" });
    await saveMcpToken("remote", { access_token: "private-access-token", token_type: "Bearer" }, env);
    const remote = (await readMcpRegistry(root, env))[1];
    expect(remote).toMatchObject({ auth: "ready", trust: "trusted", health: "needs_setup" });
    expect(JSON.stringify(remote)).not.toContain("private-access-token");
  });

  const now = 1_800_000_000_000;
  it.each([
    { label: "missing token", stored: false, access: false, expiry: undefined, auth: "needs_auth" },
    { label: "missing access token", stored: true, access: false, expiry: now + 1, auth: "needs_auth" },
    { label: "expired token", stored: true, access: true, expiry: 1, auth: "needs_auth" },
    { label: "zero expiry", stored: true, access: true, expiry: 0, auth: "needs_auth" },
    { label: "expiry at current time", stored: true, access: true, expiry: now, auth: "needs_auth" },
    { label: "future expiry", stored: true, access: true, expiry: now + 1, auth: "ready" },
    { label: "unknown expiry", stored: true, access: true, expiry: undefined, auth: "ready" },
  ])("derives OAuth readiness from $label despite a healthy prior probe", async ({ stored, access, expiry, auth }) => {
    await setMcpConnectorTrust(root, "remote", true);
    await recordMcpProbe(root, "remote", { ok: true, tools: ["read"], resources: [] });
    const tokenPath = join(home, "mcp-auth-tokens.json");
    if (stored) await saveMcpToken("remote", {
      access_token: access ? "synthetic-private-access-token" : undefined,
      refresh_token: "synthetic-private-refresh-token",
      expiry_date: expiry,
    }, env);
    const before = stored ? await readFile(tokenPath, "utf8") : null;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Registry reads must stay offline"));
    try {
      const remote = (await readMcpRegistry(root, env))[1];
      expect(remote).toMatchObject({ auth, health: auth === "ready" ? "ready" : "needs_setup" });
      expect(JSON.stringify(remote)).not.toContain("synthetic-private-");
      expect(await readMcpReceipts(root)).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
      if (stored) expect(await readFile(tokenPath, "utf8")).toBe(before);
      else await expect(readFile(tokenPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      clock.mockRestore();
      fetch.mockRestore();
    }
  });

  it("writes mode-safe credential-free lifecycle receipts", async () => {
    await appendMcpReceipt(root, {
      action: "test",
      server: "remote",
      outcome: "failed",
      detail: "token=super-secret https://mcp.example.test/api?key=also-secret",
      at: new Date("2026-07-17T01:00:00Z"),
    });
    const raw = await readFile(join(root, ".vanta", "mcp", "receipts.jsonl"), "utf8");
    expect(raw).not.toContain("super-secret");
    expect(raw).not.toContain("also-secret");
    expect(await readMcpReceipts(root)).toEqual([
      expect.objectContaining({ action: "test", server: "remote", outcome: "failed" }),
    ]);
  });
});
