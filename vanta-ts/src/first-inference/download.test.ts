import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { downloadFirstInferenceModel } from "./download.js";

const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(bytes: Buffer): Promise<{ url: string; ranges: string[] }> {
  const ranges: string[] = [];
  const server = createServer((req, res) => {
    const range = req.headers.range;
    if (range) ranges.push(range);
    const start = range ? Number(range.match(/bytes=(\d+)-/)?.[1] ?? 0) : 0;
    res.writeHead(range ? 206 : 200, { "content-length": bytes.length - start, "accept-ranges": "bytes" });
    res.end(bytes.subarray(start));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture unavailable");
  return { url: `http://127.0.0.1:${address.port}/model.gguf`, ranges };
}

function model(url: string, bytes: Buffer) {
  return { id: "fixture", label: "Fixture", url, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, filename: "fixture.gguf", contextTokens: 512 };
}

describe("first-inference downloader", () => {
  it("resumes a partial model and verifies the full checksum", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-first-download-")); roots.push(root);
    const bytes = Buffer.from("verified model bytes");
    const server = await fixture(bytes);
    const destination = join(root, "models", "fixture.gguf");
    await mkdir(join(root, "models"), { recursive: true });
    await writeFile(`${destination}.part`, bytes.subarray(0, 8));
    const result = await downloadFirstInferenceModel({ model: model(server.url, bytes), destination });
    expect(result.resumedAt).toBe(8);
    expect(server.ranges).toEqual(["bytes=8-"]);
    expect(await readFile(destination)).toEqual(bytes);
  });

  it("fails closed for offline, cancellation, and checksum mismatch", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-first-fail-")); roots.push(root);
    const bytes = Buffer.from("bad bytes");
    const server = await fixture(bytes);
    const destination = join(root, "fixture.gguf");
    const wrong = { ...model(server.url, bytes), sha256: "0".repeat(64) };
    await expect(downloadFirstInferenceModel({ model: wrong, destination })).rejects.toThrow("checksum_mismatch");
    await expect(downloadFirstInferenceModel({ model: model("http://127.0.0.1:1/model", bytes), destination })).rejects.toThrow("offline_download");
    const controller = new AbortController(); controller.abort();
    await expect(downloadFirstInferenceModel({ model: model(server.url, bytes), destination, signal: controller.signal })).rejects.toThrow("cancelled");
  });
});
