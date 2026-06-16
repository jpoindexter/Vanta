import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isPromotable, resolveVaultPath, slugify, wikiPage, writeVaultPage } from "./vault-bridge.js";
import { normalizeEntry } from "./entry-types.js";
import type { BrainEntry } from "./entries.js";

function entry(over: Partial<BrainEntry>): BrainEntry {
  return normalizeEntry({ region: "semantic", content: "x", ...over });
}

describe("isPromotable", () => {
  it("promotes a crystallized semantic fact", () => {
    expect(isPromotable(entry({ crystalStatus: "crystallized", entryType: "fact" }))).toBe(true);
  });
  it("rejects non-crystallized entries", () => {
    expect(isPromotable(entry({ crystalStatus: "compressed", entryType: "fact" }))).toBe(false);
  });
  it("rejects self regions (identity/user_model)", () => {
    expect(isPromotable(entry({ region: "user_model", crystalStatus: "crystallized", entryType: "fact" }))).toBe(false);
  });
  it("rejects non-knowledge types (emotion)", () => {
    expect(isPromotable(entry({ crystalStatus: "crystallized", entryType: "emotion" }))).toBe(false);
  });
  it("rejects already-promoted entries", () => {
    expect(isPromotable(entry({ crystalStatus: "crystallized", entryType: "fact", sourceRef: "vault:wiki/concepts/x.md" }))).toBe(false);
  });
});

describe("slugify", () => {
  it("kebab-cases and trims", () => {
    expect(slugify("Hello, World! Foo")).toBe("hello-world-foo");
  });
  it("falls back to untitled for empty", () => {
    expect(slugify("!!!")).toBe("untitled");
  });
});

describe("wikiPage", () => {
  it("renders frontmatter + title + body", () => {
    const page = wikiPage(entry({ id: "abc123", content: "Vanta gates every tool through the kernel", entryType: "insight", retrievalCount: 10 }), "2026-06-16");
    expect(page).toContain("source: \"brain:abc123\"");
    expect(page).toContain("created: 2026-06-16");
    expect(page).toContain("# Vanta gates every tool through the kernel");
    expect(page).toContain("crystallized after 10 recalls");
  });
});

describe("resolveVaultPath", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "vault-bridge-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("reads the vault path from an obsidian-vault MCP arg", async () => {
    const cfg = { mcpServers: { "obsidian-vault": { command: "node", args: ["/x/obsidian-vault-mcp/mcp-server.mjs", "/my/vault"] } } };
    writeFileSync(join(dir, "mcp.json"), JSON.stringify(cfg));
    const path = await resolveVaultPath({ VANTA_HOME: dir } as NodeJS.ProcessEnv);
    expect(path).toBe("/my/vault");
  });

  it("reads the vault path from a VAULT_PATH env entry", async () => {
    const cfg = { mcpServers: { obsidian: { command: "node", args: ["/x/mcp-server.mjs"], env: { VAULT_PATH: "/env/vault" } } } };
    writeFileSync(join(dir, "mcp.json"), JSON.stringify(cfg));
    const path = await resolveVaultPath({ VANTA_HOME: dir } as NodeJS.ProcessEnv);
    expect(path).toBe("/env/vault");
  });

  it("returns null when no vault server is configured", async () => {
    writeFileSync(join(dir, "mcp.json"), JSON.stringify({ mcpServers: { other: { command: "node", args: ["/x.mjs"] } } }));
    expect(await resolveVaultPath({ VANTA_HOME: dir } as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("writeVaultPage", () => {
  let vault: string;
  beforeEach(() => { vault = mkdtempSync(join(tmpdir(), "vault-")); });
  afterEach(() => { rmSync(vault, { recursive: true, force: true }); });

  it("writes a wiki page under wiki/concepts and returns its rel path", async () => {
    const rel = await writeVaultPage(vault, entry({ content: "Kernel assess is a gate", entryType: "fact" }), "2026-06-16");
    expect(rel).toBe(join("wiki", "concepts", "kernel-assess-is-a-gate.md"));
    expect(existsSync(join(vault, rel!))).toBe(true);
    expect(readFileSync(join(vault, rel!), "utf8")).toContain("# Kernel assess is a gate");
  });
});
