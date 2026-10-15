import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseEnvValues } from "./env-values.js";
import { addDesktopMcp, installDesktopMcp } from "./mcp-control.js";

let home: string;
let root: string;
const savedEnv = { VANTA_HOME: process.env.VANTA_HOME, VANTA_MCP_SERVERS: process.env.VANTA_MCP_SERVERS };

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-mcp-home-"));
  root = await mkdtemp(join(tmpdir(), "vanta-mcp-root-"));
  process.env.VANTA_HOME = home;
  delete process.env.VANTA_MCP_SERVERS;
});

afterEach(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  delete process.env.MY_SERVICE_KEY;
  await rm(home, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
});

describe("connector settings", () => {
  it("accepts only the settings a catalog connector declares", () => {
    expect(parseEnvValues({ GITHUB_PERSONAL_ACCESS_TOKEN: " ghp_x " }, ["GITHUB_PERSONAL_ACCESS_TOKEN"])).toEqual({ GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_x" });
    expect(() => parseEnvValues({ OTHER: "x" }, ["GITHUB_PERSONAL_ACCESS_TOKEN"])).toThrow(/not a setting of this connector/);
  });

  it("refuses names that could redirect the runtime, and drops empty values", () => {
    for (const key of ["PATH", "NODE_OPTIONS", "DYLD_INSERT_LIBRARIES", "VANTA_HOME", "lowercase"]) {
      expect(() => parseEnvValues({ [key]: "x" })).toThrow(/not an allowed setting name/);
    }
    expect(parseEnvValues({ MY_SERVICE_KEY: "   " })).toEqual({});
  });
});

describe("installing a catalog connector with its API key", () => {
  it("saves the key to the project's private .env and into the running server, never into mcp.json", async () => {
    await installDesktopMcp(root, "github", [], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_secret" });

    const envFile = join(root, ".vanta", ".env");
    expect(await readFile(envFile, "utf8")).toContain("GITHUB_PERSONAL_ACCESS_TOKEN=ghp_secret");
    expect((await stat(envFile)).mode & 0o777).toBe(0o600);
    expect(process.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe("ghp_secret");
    expect(await readFile(join(home, "mcp.json"), "utf8")).not.toContain("ghp_secret");
  });

  it("saves nothing when the key does not belong to the connector", async () => {
    await expect(installDesktopMcp(root, "github", [], { WRONG_KEY: "x" })).rejects.toThrow(/not a setting of this connector/);
    await expect(readFile(join(root, ".vanta", ".env"), "utf8")).rejects.toThrow();
  });
});

describe("adding a custom connector", () => {
  it("registers a command server with its settings as references, and keeps the value in .env", async () => {
    const payload = await addDesktopMcp(root, { name: "my-tool", command: "npx", args: ["-y", "my-mcp"] }, { MY_SERVICE_KEY: "k-123" });

    const config = JSON.parse(await readFile(join(home, "mcp.json"), "utf8"));
    expect(config.servers["my-tool"]).toEqual({ command: "npx", args: ["-y", "my-mcp"], env: { MY_SERVICE_KEY: "${MY_SERVICE_KEY}" } });
    expect(await readFile(join(root, ".vanta", ".env"), "utf8")).toContain("MY_SERVICE_KEY=k-123");
    expect(payload.connectors.find((c) => c.name === "my-tool")).toMatchObject({ trust: "pending" });
  });

  it("refuses a duplicate name, a missing target, both targets, and a non-http URL", async () => {
    await addDesktopMcp(root, { name: "dup", url: "https://example.com/mcp" });
    await expect(addDesktopMcp(root, { name: "dup", url: "https://example.com/mcp" })).rejects.toThrow(/already exists/);
    await expect(addDesktopMcp(root, { name: "none" })).rejects.toThrow(/either a command or a URL/);
    await expect(addDesktopMcp(root, { name: "both", command: "x", url: "https://e.com" })).rejects.toThrow(/either a command or a URL/);
    await expect(addDesktopMcp(root, { name: "ftp", url: "ftp://e.com" })).rejects.toThrow(/http/);
    await expect(addDesktopMcp(root, { name: "bad name!", command: "x" })).rejects.toThrow(/Name must be/);
  });
});
