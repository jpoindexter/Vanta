import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type http from "node:http";
import type { DesktopState } from "./handlers.js";
import { handleModelSettings } from "./handlers.js";

const roots: string[] = [];

afterEach(async () => {
  delete process.env.VANTA_EFFORT_LEVEL;
  delete process.env.VANTA_SERVICE_TIER;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function state(providerId: string, modelId: string, root = "/tmp/vanta-model-settings"): DesktopState {
  return {
    root,
    providerId,
    modelId,
    setup: {
      provider: { modelId: () => modelId },
      effortLevel: "medium",
    } as never,
    convo: {} as never,
  };
}

async function request(body: Record<string, unknown>, desktopState: DesktopState) {
  const req = Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
  Object.assign(req, { method: "POST" });
  let status = 0;
  let payload = "";
  const res = {
    writeHead(next: number) { status = next; },
    end(next: string) { payload = next; },
  } as unknown as http.ServerResponse;
  await handleModelSettings(desktopState, req, res);
  return { status, body: JSON.parse(payload) as Record<string, unknown> };
}

describe("desktop provider model settings", () => {
  it("applies Codex effort and speed to live session state", async () => {
    const desktopState = state("codex", "gpt-5.6-sol");
    const result = await request({ effortLevel: "ultra", speed: "fast" }, desktopState);

    expect(result.status).toBe(200);
    expect(desktopState.effortLevel).toBe("ultra");
    expect(desktopState.providerSpeed).toBe("fast");
    expect(result.body.modelSettings).toEqual({ effortLevel: "ultra", speed: "fast" });
  });

  it("rejects speed and ultra for Claude Code without mutating state", async () => {
    const desktopState = state("claude-code", "claude-sonnet-5");
    const speed = await request({ effortLevel: "high", speed: "fast" }, desktopState);
    const ultra = await request({ effortLevel: "ultra" }, desktopState);

    expect(speed.status).toBe(400);
    expect(ultra.status).toBe(400);
    expect(desktopState.effortLevel).toBe("medium");
    expect(desktopState.providerSpeed).toBeUndefined();
  });

  it("persists explicit project defaults without exposing provider credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-model-settings-"));
    roots.push(root);
    await mkdir(join(root, "vanta-ts"));
    const desktopState = state("codex", "gpt-5.6-sol", root);
    const result = await request({ effortLevel: "high", speed: "standard", scope: "global" }, desktopState);
    const saved = await readFile(join(root, "vanta-ts", ".env"), "utf8");

    expect(result.status).toBe(200);
    expect(saved).toContain("VANTA_EFFORT_LEVEL=high");
    expect(saved).toContain("VANTA_SERVICE_TIER=standard");
    expect(saved).not.toMatch(/TOKEN|API_KEY|AUTHORIZATION/);
  });
});
