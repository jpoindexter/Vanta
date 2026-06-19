import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readTrust,
  isProjectTrusted,
  trustProject,
  hasProjectDecision,
  isMcpTrusted,
  trustMcp,
  hasMcpDecision,
  trustPath,
} from "./trust.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-trust-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("trust store — fresh project", () => {
  it("treats a project with no trust file as untrusted with no decision", async () => {
    expect(await isProjectTrusted(root)).toBe(false);
    expect(await hasProjectDecision(root)).toBe(false);
    expect(await isMcpTrusted(root, "weather")).toBe(false);
    expect(await hasMcpDecision(root, "weather")).toBe(false);
  });

  it("returns the empty versioned state when no file exists", async () => {
    expect(await readTrust(root)).toEqual({ version: 1 });
  });
});

describe("project trust persistence", () => {
  it("persists and recalls a trust decision", async () => {
    await trustProject(root, true);
    expect(await isProjectTrusted(root)).toBe(true);
    expect(await hasProjectDecision(root)).toBe(true);
  });

  it("records a deny decision distinctly from never-asked", async () => {
    await trustProject(root, false);
    expect(await isProjectTrusted(root)).toBe(false);
    expect(await hasProjectDecision(root)).toBe(true);
  });

  it("overwrites a prior decision", async () => {
    await trustProject(root, true);
    await trustProject(root, false);
    expect(await isProjectTrusted(root)).toBe(false);
  });

  it("writes to .vanta/trust.json", async () => {
    await trustProject(root, true);
    const raw = await readFile(trustPath(root), "utf8");
    expect(JSON.parse(raw)).toMatchObject({ version: 1, project: true });
  });
});

describe("mcp trust persistence", () => {
  it("persists per-server decisions independently", async () => {
    await trustMcp(root, "weather", true);
    await trustMcp(root, "shady", false);
    expect(await isMcpTrusted(root, "weather")).toBe(true);
    expect(await isMcpTrusted(root, "shady")).toBe(false);
    expect(await hasMcpDecision(root, "weather")).toBe(true);
    expect(await hasMcpDecision(root, "shady")).toBe(true);
    expect(await hasMcpDecision(root, "unknown")).toBe(false);
  });

  it("does not clobber project trust when recording mcp trust", async () => {
    await trustProject(root, true);
    await trustMcp(root, "weather", true);
    expect(await isProjectTrusted(root)).toBe(true);
    expect(await isMcpTrusted(root, "weather")).toBe(true);
  });

  it("does not clobber other servers when recording one", async () => {
    await trustMcp(root, "a", true);
    await trustMcp(root, "b", true);
    expect(await isMcpTrusted(root, "a")).toBe(true);
    expect(await isMcpTrusted(root, "b")).toBe(true);
  });
});

describe("corrupt / invalid store", () => {
  it("treats malformed JSON as untrusted", async () => {
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(trustPath(root), "{ not json", "utf8");
    expect(await isProjectTrusted(root)).toBe(false);
    expect(await readTrust(root)).toEqual({ version: 1 });
  });

  it("treats schema-invalid content as untrusted", async () => {
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(trustPath(root), JSON.stringify({ version: 2, project: "yes" }), "utf8");
    expect(await isProjectTrusted(root)).toBe(false);
  });
});
