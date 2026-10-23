import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDesktopServer } from "./server.js";
import { createGraphRunState, loadGraphRunState } from "../workflow/run-state-store.js";
import { newGraphRunState } from "../workflow/run-state.js";
import type { WorkflowGraph } from "../workflow/schema.js";

const graph = { id: "desktop-proof", title: "Desktop proof", start: "node", nodes: [{ id: "node", type: "agent", instruction: "work" }], transitions: [] } as WorkflowGraph;

describe("desktop workflow-run API", () => {
  it("does not claim Running when the original executable source is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-workflow-resume-"));
    const run = newGraphRunState(graph, "missing-source", "2026-10-23T12:00:00.000Z");
    await createGraphRunState(join(root, ".vanta"), { ...run, graphHash: undefined, status: "paused", terminal: {
      state: "paused", reason: "operator pause requested", at: run.updatedAt,
    } });
    const server = createDesktopServer(root);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/workflow-runs/missing-source`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "retry" }),
      });
      expect(response.status).toBe(409);
      expect((await loadGraphRunState(join(root, ".vanta"), "missing-source"))?.status).toBe("paused");
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it("opens a run, requests a safe pause, and exports a redacted handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-workflow-api-"));
    await createGraphRunState(join(root, ".vanta"), newGraphRunState(graph, "desktop-run", "2026-07-20T12:00:00.000Z"));
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const list = await (await fetch(`${base}/api/workflow-runs`)).json() as Array<{ runId: string }>;
      expect(list).toMatchObject([{ runId: "desktop-run" }]);
      const paused = await fetch(`${base}/api/workflow-runs/desktop-run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pause" }) });
      expect(await paused.json()).toMatchObject({ controls: ["pause", "cancel"] });
      const exported = await (await fetch(`${base}/api/workflow-runs/desktop-run/export`)).json() as { handoff: string };
      expect(exported.handoff).toContain("never replayed by default");
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
