import { describe, expect, it, vi } from "vitest";
import { handleModelDownloads } from "./model-download-api.js";

function request(body: unknown) {
  const raw = JSON.stringify(body);
  const req = { method: "POST", on: (event: string, listener: (chunk?: Buffer) => void) => { if (event === "data") listener(Buffer.from(raw)); if (event === "end") listener(); return req; } } as any;
  return req;
}

function response() {
  let status = 0; let body = "";
  return { res: { writeHead: (value: number) => { status = value; }, end: (value: string) => { body = value; } } as any, result: () => ({ status, body: JSON.parse(body) }) };
}

describe("desktop model download API", () => {
  it("enqueues and starts a durable model download", async () => {
    const queued = { id: "qwen", status: "queued" };
    const enqueue = vi.fn(async () => ({ job: queued, duplicate: false }));
    const run = vi.fn(async () => ({ ...queued, status: "completed" }));
    const queue = { enqueue, run, list: vi.fn(async () => [queued]) } as any;
    const reply = response();
    await handleModelDownloads({ root: "/missing" }, request({ action: "enqueue", input: { id: "qwen" }, start: true }), reply.res, queue);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reply.result()).toMatchObject({ status: 200, body: { jobs: [queued] } });
    expect(run).toHaveBeenCalledWith("qwen");
  });

  it("pauses, retries, and confirmation-gates cleanup", async () => {
    const queued = { id: "qwen", status: "paused" };
    const pause = vi.fn(async () => queued); const retry = vi.fn(async () => queued);
    const cleanup = vi.fn(async (_id, confirmed) => { if (!confirmed) throw new Error("requires confirmation"); return queued; });
    const queue = { pause, retry, cleanup, list: vi.fn(async () => [queued]) } as any;
    for (const body of [{ action: "pause", id: "qwen" }, { action: "retry", id: "qwen", background: false }]) {
      const reply = response(); await handleModelDownloads({ root: "/missing" }, request(body), reply.res, queue); expect(reply.result().status).toBe(200);
    }
    const rejected = response();
    await handleModelDownloads({ root: "/missing" }, request({ action: "cleanup", id: "qwen", confirmed: false }), rejected.res, queue);
    expect(rejected.result()).toMatchObject({ status: 400, body: { error: expect.stringContaining("confirmation") } });
  });
});
