// Real-path proof for the model-callable `session_search` tool.
//
// Seeds two saved sessions through the real session store into a throwaway
// VANTA_HOME, then runs a real one-shot session (`vanta run`) against a local
// OpenAI-compatible stand-in. The stand-in scripts the model: first turn calls
// session_search, second turn answers from the tool result. Prints the tool call
// the model made, the tool result the model received, the final answer and the
// requests the endpoint saw. Fake keys only; nothing leaves 127.0.0.1.
//
//   VANTA_KERNEL_BIN=/path/to/vanta-kernel node --import tsx scripts/session-search-smoke.mjs

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveSession } from "../src/sessions/store.ts";

const MODEL = "stand-in-main";
const SECRET = `ghp_${"a1B2".repeat(9)}`;
const kernelBin = process.env.VANTA_KERNEL_BIN;
if (!kernelBin) {
  console.error("VANTA_KERNEL_BIN must point at a built vanta-kernel binary (cargo build -p vanta-kernel).");
  process.exit(2);
}

const transcript = [];
function scriptedReply(payload) {
  const messages = payload.messages ?? [];
  const toolMessage = [...messages].reverse().find((m) => m.role === "tool");
  const offered = (payload.tools ?? []).map((t) => t.function?.name ?? t.name);
  if (toolMessage) {
    const hits = String(toolMessage.content).split("\n").filter((line) => /^\d+\. \[/.test(line));
    return { text: `From an earlier session:\n${hits.join("\n")}` };
  }
  if (offered.includes("session_search")) {
    return { call: { name: "session_search", arguments: JSON.stringify({ query: "which database ledger", limit: 3 }) } };
  }
  return { text: "ok" };
}

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    const payload = JSON.parse(body || "{}");
    const reply = scriptedReply(payload);
    const toolMessage = (payload.messages ?? []).find((m) => m.role === "tool");
    transcript.push({
      lastUser: [...(payload.messages ?? [])].reverse().find((m) => m.role === "user")?.content,
      offeredSessionSearch: (payload.tools ?? []).some((t) => (t.function?.name ?? t.name) === "session_search"),
      sawToolResult: toolMessage ? String(toolMessage.content) : null,
      reply,
    });
    const usage = { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 };
    const delta = reply.call
      ? { role: "assistant", content: null, tool_calls: [{ index: 0, id: "call_ss_1", type: "function", function: reply.call }] }
      : { role: "assistant", content: reply.text };
    const finish = reply.call ? "tool_calls" : "stop";
    if (payload.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      send({ id: "c1", object: "chat.completion.chunk", model: payload.model, choices: [{ index: 0, delta, finish_reason: null }] });
      send({ id: "c1", object: "chat.completion.chunk", model: payload.model, choices: [{ index: 0, delta: {}, finish_reason: finish }] });
      send({ id: "c1", object: "chat.completion.chunk", model: payload.model, choices: [], usage });
      res.end("data: [DONE]\n\n");
      return;
    }
    const { role, content, tool_calls } = delta;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "c1", object: "chat.completion", model: payload.model, choices: [{ index: 0, message: { role, content, ...(tool_calls ? { tool_calls: tool_calls.map(({ index: _i, ...rest }) => rest) } : {}) }, finish_reason: finish }], usage }));
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

const root = await mkdtemp(join(tmpdir(), "vanta-session-search-root-"));
const home = await mkdtemp(join(tmpdir(), "vanta-session-search-home-"));
const env = { ...process.env, VANTA_HOME: home };
await saveSession("20261001-091500", [
  { role: "user", content: "Which database should the ledger use?" },
  { role: "assistant", content: `We decided the ledger uses Postgres, not SQLite, for concurrent writers. (old key ${SECRET} was rotated)` },
], { env, now: "2026-10-01T09:15:00Z", title: "Ledger database decision" });
await saveSession("20261002-140000", [
  { role: "user", content: "Plan the launch email" },
  { role: "assistant", content: "Draft the launch email for Tuesday." },
], { env, now: "2026-10-02T14:00:00Z", title: "Launch email" });

const childEnv = {
  PATH: process.env.PATH,
  HOME: home,
  VANTA_HOME: home,
  VANTA_PROJECT_ROOT: root,
  VANTA_PROVIDER: "custom",
  VANTA_OPENAI_BASE_URL: endpoint,
  VANTA_OPENAI_KEY: "fake-key-not-real",
  VANTA_MODEL: MODEL,
  // A loopback endpoint is treated as a local model and gets the small coding toolset by default.
  VANTA_LOCAL_FULL_TOOLS: "1",
  VANTA_KERNEL_BIN: kernelBin,
  VANTA_KERNEL_URL: `http://127.0.0.1:${await freePort()}`,
  VANTA_KERNEL_EPHEMERAL: "1",
};
const failures = [];
const expect = (ok, message) => { if (!ok) failures.push(message); };
let out = "";
try {
  const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", "run", "What did we decide about the ledger database?"], { env: childEnv, cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { out += d; });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  console.log(`vanta run exit code: ${code}`);
  console.log("\n== vanta run output ==\n" + out.trim());
  console.log("\n== endpoint transcript ==");
  transcript.forEach((t, i) => {
    console.log(`request ${i + 1}: user=${JSON.stringify(t.lastUser)} session_search offered=${t.offeredSessionSearch}`);
    if (t.sawToolResult) console.log(`  tool result the model received:\n    ${t.sawToolResult.split("\n").join("\n    ")}`);
    console.log(`  scripted reply: ${JSON.stringify(t.reply)}`);
  });
  const withResult = transcript.find((t) => t.sawToolResult);
  expect(code === 0, "vanta run did not exit cleanly");
  expect(transcript[0]?.offeredSessionSearch === true, "session_search was not offered to the model");
  expect(transcript[0]?.reply.call?.name === "session_search", "first turn did not call session_search");
  expect(Boolean(withResult), "the tool result never reached the model");
  expect(withResult?.sawToolResult.includes("20261001-091500") && withResult.sawToolResult.includes("Postgres"), "tool result lacks the earlier session id/snippet");
  expect(!withResult?.sawToolResult.includes("20261002-140000"), "unrelated session leaked into the result");
  expect(!withResult?.sawToolResult.includes(SECRET) && !out.includes(SECRET), "secret was echoed");
  expect(out.includes("From an earlier session") && out.includes("Postgres"), "final answer lacks the earlier-session snippet");
} finally {
  server.close();
  await rm(root, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
}
if (failures.length) {
  console.error(`\nFAILED:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nOK: session_search called by the model, result returned, final answer cites the earlier session.");
