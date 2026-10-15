// Real-path proof for the opt-in cheaper model for post-turn background forks.
//
// Starts a local OpenAI-compatible stand-in, runs a real one-shot session
// (`vanta run`) against it twice in a throwaway project root and VANTA_HOME, and
// reads the route ledger the session wrote:
//   run A: VANTA_MODEL_LEARN=<cheap id>  -> main row purpose=main on the main id,
//                                           review-fork row purpose=learn on the cheap id
//   run B: VANTA_MODEL_LEARN unset       -> review-fork row purpose=learn on the main id
//   run C: VANTA_MODEL_LEARN=<id the endpoint rejects> -> fork runs on the main id,
//                                           fallbackDepth 1, one warning line
// Fake keys only; nothing leaves 127.0.0.1.
//
//   VANTA_KERNEL_BIN=/path/to/vanta-kernel node scripts/fork-route-smoke.mjs

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAIN_MODEL = "stand-in-main";
const CHEAP_MODEL = "stand-in-cheap";
const REJECTED_MODEL = "stand-in-rejected";
const kernelBin = process.env.VANTA_KERNEL_BIN;
if (!kernelBin) {
  console.error("VANTA_KERNEL_BIN must point at a built vanta-kernel binary (cargo build -p vanta-kernel).");
  process.exit(2);
}

const requests = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    const payload = JSON.parse(body || "{}");
    const reviewer = JSON.stringify(payload.messages ?? []).includes("self-improvement reviewer");
    requests.push({ model: payload.model, kind: reviewer ? "review-fork" : "main-turn" });
    if (payload.model === REJECTED_MODEL) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `model ${REJECTED_MODEL} not found`, type: "invalid_request_error" } }));
      return;
    }
    const text = reviewer ? "no skill" : "Hello from the stand-in.";
    const usage = { prompt_tokens: 120, completion_tokens: 12, total_tokens: 132 };
    if (payload.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      send({ id: "c1", object: "chat.completion.chunk", model: payload.model, choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] });
      send({ id: "c1", object: "chat.completion.chunk", model: payload.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      send({ id: "c1", object: "chat.completion.chunk", model: payload.model, choices: [], usage });
      res.end("data: [DONE]\n\n");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "c1", object: "chat.completion", model: payload.model, choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }], usage }));
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/v1`;

function freePort() {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function runSession(label, learnEnv) {
  const root = await mkdtemp(join(tmpdir(), `vanta-fork-route-${label}-`));
  const home = await mkdtemp(join(tmpdir(), `vanta-fork-route-home-${label}-`));
  requests.length = 0;
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    VANTA_HOME: home,
    VANTA_PROJECT_ROOT: root,
    VANTA_PROVIDER: "custom",
    VANTA_OPENAI_BASE_URL: endpoint,
    VANTA_OPENAI_KEY: "fake-key-not-real",
    VANTA_MODEL: MAIN_MODEL,
    VANTA_REVIEW_EVERY: "1",
    VANTA_KERNEL_BIN: kernelBin,
    VANTA_KERNEL_URL: `http://127.0.0.1:${await freePort()}`,
    VANTA_KERNEL_EPHEMERAL: "1",
    ...learnEnv,
  };
  const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", "run", "say hello"], { env, cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { out += d; });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  const raw = await readFile(join(root, ".vanta", "route-usage-ledger.jsonl"), "utf8").catch(() => "");
  const rows = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const warnings = out.split("\n").filter((line) => line.startsWith("vanta: VANTA_"));
  await rm(root, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
  return { code, rows, warnings, requests: [...requests] };
}

function show(title, run) {
  console.log(`\n== ${title} (exit ${run.code}) ==`);
  console.log("ledger rows:");
  for (const r of run.rows) console.log(`  purpose=${r.purpose} model=${r.model} agent=${r.agent} fallbackDepth=${r.fallbackDepth} in=${r.inputTokens} out=${r.outputTokens}`);
  console.log("endpoint saw:");
  for (const r of run.requests) console.log(`  ${r.kind} -> model ${r.model}`);
  console.log(`warnings: ${run.warnings.length ? `\n  ${run.warnings.join("\n  ")}` : "none"}`);
}

const failures = [];
function expect(ok, message) { if (!ok) failures.push(message); }
const only = (run, purpose) => run.rows.filter((r) => r.purpose === purpose);

try {
  const routed = await runSession("routed", { VANTA_MODEL_LEARN: CHEAP_MODEL });
  show(`A: VANTA_MODEL_LEARN=${CHEAP_MODEL}`, routed);
  expect(only(routed, "main").some((r) => r.model === MAIN_MODEL), "A: no purpose=main row on the main model");
  expect(only(routed, "learn").some((r) => r.model === CHEAP_MODEL), "A: no purpose=learn row on the cheap model");
  expect(routed.requests.some((r) => r.kind === "review-fork" && r.model === CHEAP_MODEL), "A: review fork did not reach the cheap model");
  expect(routed.warnings.length === 0, "A: unexpected warning");

  const unset = await runSession("unset", {});
  show("B: VANTA_MODEL_LEARN unset", unset);
  expect(only(unset, "main").some((r) => r.model === MAIN_MODEL), "B: no purpose=main row on the main model");
  expect(only(unset, "learn").length > 0 && only(unset, "learn").every((r) => r.model === MAIN_MODEL), "B: learn row not on the main model");
  expect(unset.requests.every((r) => r.model === MAIN_MODEL), "B: a request left the main model");

  const bad = await runSession("bad", { VANTA_MODEL_LEARN: REJECTED_MODEL });
  show(`C: VANTA_MODEL_LEARN=${REJECTED_MODEL} (endpoint answers 404)`, bad);
  expect(only(bad, "learn").some((r) => r.model === MAIN_MODEL && r.fallbackDepth === 1), "C: no fallback learn row on the main model");
  expect(bad.warnings.length === 1, `C: expected exactly one warning line, got ${bad.warnings.length}`);
  expect(bad.code === 0, "C: the session did not exit cleanly");
} finally {
  server.close();
}

if (failures.length) {
  console.error(`\nFAILED:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nOK: fork routing and purpose attribution verified against the stand-in.");
