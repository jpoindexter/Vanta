import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleDesktopVoiceStatus, handleDesktopVoiceTranscribe } from "./voice-api.js";

let server: http.Server | undefined;
afterEach(async () => { if (server) { server.closeAllConnections(); await new Promise<void>((r) => server!.close(() => r())); } });

async function serve(transcribe = vi.fn(async () => ({ text: "A local draft", provider: "local-whisper" as const, model: "tiny" }))) {
  server = http.createServer((req, res) => {
    if (req.method === "GET") void handleDesktopVoiceStatus(res, { status: async () => ({ ready: false, provider: "local-whisper", model: "tiny", reason: "Install model" }) });
    else void handleDesktopVoiceTranscribe(req, res, { transcribe });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return { url: `http://127.0.0.1:${address.port}`, transcribe };
}

describe("desktop local dictation HTTP adapter", () => {
  it("returns a redacted actionable error when readiness itself fails", async () => {
    server = http.createServer((_req, res) => {
      void handleDesktopVoiceStatus(res, { status: async () => { throw new Error("private path /secret/model.pt"); } });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}`);
    expect(response.status).toBe(503);
    const body = await response.json() as { ready: boolean; error: string; reason: string };
    expect(body).toMatchObject({ ready: false, error: "Local dictation is unavailable. Check the local installation." });
    expect(body.reason).toBe(body.error);
    expect(JSON.stringify(body)).not.toContain("secret");
  });
  it("reports unavailable truth and returns transcript without running an agent", async () => {
    const { url, transcribe } = await serve();
    expect(await (await fetch(url)).json()).toMatchObject({ ready: false, reason: "Install model" });
    const result = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audioBase64: Buffer.from("RIFF0000WAVEfmt ").toString("base64"), mimeType: "audio/wav" }) });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ text: "A local draft", provider: "local-whisper" });
    expect(transcribe).toHaveBeenCalledOnce();
  });
  it("rejects malformed JSON, wrong content type and invalid base64 before transcription", async () => {
    const { url, transcribe } = await serve();
    for (const body of ["{", JSON.stringify({ audioBase64: "!bad", mimeType: "audio/wav" }), "null"]) {
      expect((await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body })).status).toBe(400);
    }
    expect((await fetch(url, { method: "POST", body: "audio" })).status).toBe(415);
    expect(transcribe).not.toHaveBeenCalled();
  });
  it("bounds incoming bodies and hides raw exceptions", async () => {
    const transcribe = vi.fn(async () => { throw new Error("private /audio/path secret"); });
    const { url } = await serve(transcribe);
    const large = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "a".repeat(6 * 1024 * 1024) });
    expect(large.status).toBe(413);
    const failed = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audioBase64: "YXVkaW8=", mimeType: "audio/wav" }) });
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain("secret");
  });
});
