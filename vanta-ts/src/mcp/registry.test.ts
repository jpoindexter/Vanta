import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
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
