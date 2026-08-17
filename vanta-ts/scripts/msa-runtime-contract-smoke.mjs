import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMsaClient } from "../src/memory/msa-client.ts";
import { resolveMemoryProvider } from "../src/memory/provider.ts";

const token = "contract-proof-token";
const seen = [];
const server = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401).end();
      return;
    }
    seen.push({ method: request.method, url: request.url, body: body ? JSON.parse(body) : null });
    response.setHeader("content-type", "application/json");
    if (request.url === "/v1/health") response.end(JSON.stringify({ ready: true, status: "ok", model: "mock-msa" }));
    else if (request.url === "/v1/memories") response.end(JSON.stringify({ accepted: 1, rejected: 0, indexedIds: ["proof-doc"] }));
    else if (request.url === "/v1/query") response.end(JSON.stringify({ results: [{ id: "proof-doc", text: "contract evidence", score: 0.99 }] }));
    else if (request.url === "/v1/generate") response.end(JSON.stringify({ answer: "contract answer", citations: [{ id: "proof-doc", text: "contract evidence" }] }));
    else response.writeHead(404).end();
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const home = await mkdtemp(join(tmpdir(), "vanta-msa-proof-"));
try {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("mock MSA address unavailable");
  const env = {
    VANTA_HOME: home,
    VANTA_MEMORY: "msa",
    VANTA_MSA_URL: `http://127.0.0.1:${address.port}`,
    VANTA_MSA_TOKEN: token,
    VANTA_MSA_TIMEOUT_MS: "2000",
  };
  const client = resolveMsaClient(env);
  if (!client) throw new Error("MSA client did not resolve");
  const health = await client.health();
  const indexed = await client.index({ documents: [{ id: "proof-doc", text: "contract evidence" }] });
  const query = await client.query({ query: "proof?", topK: 3 });
  const generated = await client.generate({ query: "proof?", topK: 3 });
  if (!health.ok || !health.value.ready) throw new Error("health contract failed");
  if (!indexed.ok || indexed.value.accepted !== 1) throw new Error("index contract failed");
  if (!query.ok || query.value.results[0]?.id !== "proof-doc") throw new Error("query contract failed");
  if (!generated.ok || generated.value.answer !== "contract answer") throw new Error("generate contract failed");
  const paths = seen.map((request) => request.url);
  for (const path of ["/v1/health", "/v1/memories", "/v1/query", "/v1/generate"]) {
    if (!paths.includes(path)) throw new Error(`missing request ${path}`);
  }
  const provider = resolveMemoryProvider(env);
  const localEntry = await provider.remember("local source of truth", { env });
  const recalled = await provider.recall("proof?", { topK: 3, env });
  if (provider.id !== "msa") throw new Error("MSA memory provider did not resolve");
  if (!localEntry.id || recalled.entries[0]?.sourceRef !== "msa:proof-doc") {
    throw new Error("local-first provider path failed");
  }
  console.log(JSON.stringify({
    proof: "MSA_CONTRACT_PROOF_OK",
    endpoints: 4,
    auth: "bearer",
    transport: "http-loopback",
    provider: provider.id,
    localSourceOfTruth: true,
    remoteRecall: true,
    externalBoundary: "mock MSA runtime; no model inference",
  }));
} finally {
  await rm(home, { recursive: true, force: true });
  await new Promise((resolve) => server.close(resolve));
}
