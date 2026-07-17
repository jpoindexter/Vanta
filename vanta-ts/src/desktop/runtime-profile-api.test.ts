import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleRuntimeProfiles } from "./runtime-profile-api.js";

let root: string;
const gib = 1024 ** 3;

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-runtime-profile-api-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

function request(body: unknown) {
  const raw = JSON.stringify(body);
  const req = { method: "POST", on: (event: string, listener: (chunk?: Buffer) => void) => { if (event === "data") listener(Buffer.from(raw)); if (event === "end") listener(); return req; } } as any;
  return req;
}

function response() {
  let status = 0; let body = "";
  return { res: { writeHead: (value: number) => { status = value; }, end: (value: string) => { body = value; } } as any, result: () => ({ status, body: JSON.parse(body) }) };
}

describe("desktop runtime profile API", () => {
  it("creates and selects a host-compatible profile with command/resource evidence", async () => {
    const host = { platform: "darwin", architecture: "arm64", memoryBytes: 16 * gib };
    const created = response();
    await handleRuntimeProfiles({ root }, request({ action: "create", input: { id: "daily", name: "Daily", backend: "llama_cpp", modelPath: "/models/qwen.gguf", modelBytes: gib, availableMemoryBytes: 16 * gib } }), created.res, host);
    const selected = response();
    await handleRuntimeProfiles({ root }, request({ action: "select", id: "daily" }), selected.res, host);

    expect(created.result()).toMatchObject({ status: 200, body: { profiles: [{ preview: { command: "llama-server", resource: { fits: true } }, roundTrip: true }] } });
    expect(selected.result()).toMatchObject({ status: 200, body: { selectedId: "daily" } });
  });

  it("blocks selecting a cross-host profile with recovery copy", async () => {
    const mac = { platform: "darwin", architecture: "arm64", memoryBytes: 16 * gib };
    await handleRuntimeProfiles({ root }, request({ action: "create", input: { id: "mlx", name: "MLX", backend: "mlx", modelPath: "/models/mlx", modelBytes: gib, availableMemoryBytes: 16 * gib } }), response().res, mac);
    const reply = response();
    await handleRuntimeProfiles({ root }, request({ action: "select", id: "mlx" }), reply.res, { platform: "linux", architecture: "x64", memoryBytes: 16 * gib });
    expect(reply.result()).toMatchObject({ status: 409, body: { error: expect.stringContaining("Clone this profile"), issues: [expect.objectContaining({ code: "host_incompatible" })] } });
  });
});
