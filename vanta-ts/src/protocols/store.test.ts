import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listProtocols,
  readProtocol,
  writeProtocol,
  deleteProtocol,
} from "./store.js";
import type { Protocol } from "./store.js";

async function tempDataDir(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), "vanta-proto-")), ".vanta");
  await mkdir(dir, { recursive: true });
  return dir;
}

function makeProtocol(name: string): Protocol {
  return {
    name,
    description: `Description for ${name}`,
    steps: ["Step 1", "Step 2", "Step 3"],
    createdAt: "2026-06-08T10:00:00.000Z",
    updatedAt: "2026-06-08T10:00:00.000Z",
  };
}

describe("listProtocols", () => {
  it("returns [] for an empty dir", async () => {
    const dir = await tempDataDir();
    const result = await listProtocols(dir);
    expect(result).toEqual([]);
  });

  it("returns [] when the protocols dir does not exist", async () => {
    const dir = await tempDataDir();
    const result = await listProtocols(join(dir, "nonexistent"));
    expect(result).toEqual([]);
  });

  it("returns all written protocols", async () => {
    const dir = await tempDataDir();
    const p1 = makeProtocol("deploy-checklist");
    const p2 = makeProtocol("code-review");
    await writeProtocol(dir, p1);
    await writeProtocol(dir, p2);
    const result = await listProtocols(dir);
    expect(result).toHaveLength(2);
    const names = result.map((p) => p.name).sort();
    expect(names).toEqual(["code-review", "deploy-checklist"]);
  });
});

describe("writeProtocol + readProtocol", () => {
  it("round-trips correctly", async () => {
    const dir = await tempDataDir();
    const protocol = makeProtocol("incident-response");
    await writeProtocol(dir, protocol);
    const loaded = await readProtocol(dir, "incident-response");
    expect(loaded).toEqual(protocol);
  });

  it("overwrites an existing protocol", async () => {
    const dir = await tempDataDir();
    const original = makeProtocol("deploy-checklist");
    await writeProtocol(dir, original);
    const updated: Protocol = { ...original, description: "Updated description", updatedAt: "2026-06-08T12:00:00.000Z" };
    await writeProtocol(dir, updated);
    const loaded = await readProtocol(dir, "deploy-checklist");
    expect(loaded?.description).toBe("Updated description");
  });
});

describe("readProtocol", () => {
  it("returns null for an unknown name", async () => {
    const dir = await tempDataDir();
    const result = await readProtocol(dir, "nonexistent");
    expect(result).toBeNull();
  });
});

describe("deleteProtocol", () => {
  it("removes the file and returns true", async () => {
    const dir = await tempDataDir();
    const protocol = makeProtocol("cleanup");
    await writeProtocol(dir, protocol);
    const result = await deleteProtocol(dir, "cleanup");
    expect(result).toBe(true);
    expect(await readProtocol(dir, "cleanup")).toBeNull();
  });

  it("returns false for a missing protocol", async () => {
    const dir = await tempDataDir();
    const result = await deleteProtocol(dir, "ghost");
    expect(result).toBe(false);
  });
});
