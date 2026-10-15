import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareSessionCapabilities } from "./capability-setup.js";
import { capabilitySnapshot, formatCapabilitySnapshot } from "../agent/capability-snapshot.js";
import type { KernelClient } from "../kernel/client.js";

let root: string;
const safety = { assess: async () => ({ risk: "allow" }) } as unknown as KernelClient;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-capability-setup-"));
  vi.stubEnv("VANTA_HOME", join(root, "isolated-home"));
  vi.stubEnv("VANTA_PROVIDER", "ollama");
  vi.stubEnv("VANTA_SAFE_MODE", "");
  vi.stubEnv("VANTA_BARE", "");
  vi.stubEnv("VANTA_LOCAL_FULL_TOOLS", "");
  vi.stubEnv("VANTA_MCP_AUTO_MOUNT", "1");
  vi.stubEnv("VANTA_MCP_SERVERS", JSON.stringify({ servers: { disabled: { command: "/does/not/exist", tools: [] } } }));
  await mkdir(join(root, ".vanta"));
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

describe("shared post-policy capability assembly used by CLI and sessions", () => {
  it("respects local runtime policy and an explicitly disabled MCP server", async () => {
    await writeFile(join(root, ".vanta/settings.json"), JSON.stringify({ mcp: { deny: ["disabled"] } }));
    const prepared = await prepareSessionCapabilities(root, safety);
    try {
      expect(prepared.registry.schemas().map((tool) => tool.name)).toContain("read_file");
      expect(prepared.registry.schemas().map((tool) => tool.name)).not.toContain("browser_act");
      expect(formatCapabilitySnapshot(capabilitySnapshot(prepared.registry.schemas()))).not.toContain("mcp_disabled");
      expect(prepared.provider.routeInfo?.().billingMode).toBe("local");
    } finally { prepared.dispose(); }
  });

  it("preserves explicit-empty tool scope and prevents extensions from restoring excluded tools", async () => {
    await writeFile(join(root, ".vanta/settings.json"), JSON.stringify({ allowedTools: [], mcp: { allow: [] } }));
    const prepared = await prepareSessionCapabilities(root, safety);
    try { expect(prepared.registry.schemas()).toEqual([]); }
    finally { prepared.dispose(); }
  });

  it("keeps a delegated role scope and denied routes absent", async () => {
    await writeFile(join(root, ".vanta/settings.json"), JSON.stringify({ allowedTools: ["read_file", "write_file", "delegate"], blockedTools: ["write_file", "delegate"], mcp: { allow: [] } }));
    const prepared = await prepareSessionCapabilities(root, safety);
    try { expect(prepared.registry.schemas().map((tool) => tool.name)).toEqual(["read_file"]); }
    finally { prepared.dispose(); }
  });
});
