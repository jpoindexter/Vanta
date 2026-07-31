import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import { mountMcpServers } from "./mount.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("MCP launch trust boundary", () => {
  it("does not start an undecided server before the operator denies trust", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-mcp-trust-"));
    roots.push(root);
    const marker = join(root, "server-started");
    const server = join(root, "server.mjs");
    await writeFile(server, SERVER, "utf8");
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      VANTA_MCP_SERVERS: JSON.stringify({
        servers: {
          untrusted: {
            command: process.execPath,
            args: [server, marker],
          },
        },
      }),
    } as NodeJS.ProcessEnv;

    const result = await mountMcpServers(new ToolRegistry(), env, () => {}, {
      cwd: root,
      trust: { root, confirm: async () => false },
    });
    result.dispose();

    await expect(readFile(marker, "utf8")).rejects.toThrow();
    expect(result.servers).toEqual([]);
    expect(result.toolCount).toBe(0);
  });

  it("requires a new decision when a trusted server launch definition changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-mcp-identity-"));
    roots.push(root);
    const server = join(root, "server.mjs");
    const firstMarker = join(root, "first-started");
    const changedMarker = join(root, "changed-started");
    await writeFile(server, SERVER, "utf8");
    let confirmations = 0;
    const confirm = async (): Promise<boolean> => {
      confirmations += 1;
      return confirmations === 1;
    };
    const config = (marker: string, revision: string): NodeJS.ProcessEnv => ({
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      VANTA_MCP_SERVERS: JSON.stringify({
        servers: {
          versioned: {
            command: process.execPath,
            args: [server, marker, revision],
          },
        },
      }),
    });

    const first = await mountMcpServers(new ToolRegistry(), config(firstMarker, "v1"), () => {}, {
      cwd: root,
      trust: { root, confirm },
    });
    first.dispose();
    expect(await readFile(firstMarker, "utf8")).toBe("started");

    const changed = await mountMcpServers(new ToolRegistry(), config(changedMarker, "v2"), () => {}, {
      cwd: root,
      trust: { root, confirm },
    });
    changed.dispose();

    expect(confirmations).toBe(2);
    await expect(readFile(changedMarker, "utf8")).rejects.toThrow();
  });
});

const SERVER = String.raw`
import { writeFileSync } from "node:fs";
import readline from "node:readline";
writeFileSync(process.argv[2], "started");
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  const result = message.method === "initialize"
    ? { protocolVersion: "2024-11-05", capabilities: {} }
    : message.method === "tools/list"
      ? { tools: [{ name: "read", description: "read" }] }
      : {};
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n");
});
`;
