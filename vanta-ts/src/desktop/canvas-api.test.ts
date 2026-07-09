import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasArtifactSchema, writeCanvasArtifact } from "../canvas/artifact.js";
import { createDesktopServer } from "./server.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("desktop canvas API", () => {
  it("serves the current validated artifact without starting a conversation", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-canvas-api-"));
    roots.push(root);
    const artifact = CanvasArtifactSchema.parse({
      version: 1, id: "board-1", kind: "board", title: "Build now",
      createdAt: "2026-07-10T12:00:00.000Z", source: { tool: "render_canvas" },
      board: { columns: [{ title: "Now", items: [{ title: "Canvas", status: "building" }] }] },
    });
    await writeCanvasArtifact(root, artifact);
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      const response = await fetch(`http://127.0.0.1:${port}/api/canvas`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(artifact);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
