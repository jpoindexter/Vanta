import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";
import { assertReceiptCorpus, parseJsonLines } from "./lib/trust-02-packaged-proof.mjs";

const executablePath = resolve(process.env.VANTA_DESKTOP_APP ?? "release/mac-arm64/Vanta.app/Contents/MacOS/Vanta");
assert.ok(existsSync(executablePath), `packaged Vanta executable not found: ${executablePath}`);

const home = await mkdtemp(join(tmpdir(), "vanta-trust-02-home-"));
const project = await mkdtemp(join(tmpdir(), "vanta-trust-02-project-"));
const firstUserData = await mkdtemp(join(tmpdir(), "vanta-trust-02-profile-a-"));
const secondUserData = await mkdtemp(join(tmpdir(), "vanta-trust-02-profile-b-"));
const vantaDir = join(project, ".vanta");
const envPath = join(project, ".env");
const auditKeyPath = join(vantaDir, "audit.key");
const auditEventsPath = join(vantaDir, "events.jsonl");
const sameRunPath = join(project, "same-run-proof.txt");
const restartPath = join(project, "restart-proof.txt");
const activationPath = join(project, "hook-activated.txt");
const projectSecret = "PROJECT_SECRET_VALUE_TRUST_02";
const auditSecret = "AUDIT_SIGNING_SECRET_TRUST_02";
const hookContent = `${JSON.stringify({
  PostToolUse: [{ matcher: "write_file", command: `printf activated > ${activationPath}` }],
}, null, 2)}\n`;
const hookDigest = sha256(hookContent);
const scenarios = new Map();
let activeScenario;
let app;
let page;

await mkdir(vantaDir, { recursive: true });
await Promise.all([
  writeFile(envPath, `PROJECT_TOKEN=${projectSecret}\n`, { mode: 0o600 }),
  writeFile(auditKeyPath, `${auditSecret}\n`, { mode: 0o600 }),
  writeFile(auditEventsPath, '{"kind":"fixture-anchor"}\n', { mode: 0o600 }),
]);

const provider = createServer(async (request, response) => {
  if (request.url === "/v1/models") return json(response, { object: "list", data: [{ id: "trust-02-proof", object: "model" }] });
  if (request.url !== "/v1/chat/completions") return void response.writeHead(404).end();
  assert.ok(activeScenario, "provider received a completion without an active proof scenario");
  const body = JSON.parse(await readBody(request));
  activeScenario.requests += 1;
  if (activeScenario.requests === 1) {
    const exposed = new Set((body.tools ?? []).map((tool) => tool.function?.name));
    for (const tool of activeScenario.tools) assert.ok(exposed.has(tool.name), `${tool.name} schema was not exposed`);
    return streamTools(response, activeScenario.tools, activeScenario.name);
  }
  if (activeScenario.requests === 2) {
    const outputs = new Map((body.messages ?? [])
      .filter((message) => message.role === "tool")
      .map((message) => [message.tool_call_id, String(message.content ?? "")]));
    try { activeScenario.assertOutputs(outputs); }
    catch (error) { activeScenario.outputError = error; }
    return streamText(response, activeScenario.finalText, activeScenario.name);
  }
  throw new Error(`${activeScenario.name} made unexpected provider request ${activeScenario.requests}`);
});

await new Promise((resolveListen, rejectListen) => {
  provider.once("error", rejectListen);
  provider.listen(0, "127.0.0.1", resolveListen);
});
const providerAddress = provider.address();
assert.ok(providerAddress && typeof providerAddress === "object");
const providerBaseUrl = `http://127.0.0.1:${providerAddress.port}/v1`;

try {
  ({ app, page } = await launch(firstUserData, 7860));
  await setFullAccess(page);

  const denied = scenario({
    name: "hook-denied",
    tools: [{ name: "write_file", id: "trust-hook-denied", args: { path: ".vanta/hooks.json", content: hookContent } }],
    finalText: "TRUST_HOOK_DENIED_OK",
    assertOutputs: (outputs) => {
      assert.match(outputs.get("trust-hook-denied") ?? "", /denied.*control-plane/i);
    },
  });
  const deniedTurn = runScenario(page, denied, { decision: "deny" });
  void deniedTurn.catch(() => undefined);
  let deniedApproval;
  try {
    deniedApproval = await waitForApproval(page);
    assertExactHookApproval(deniedApproval);
    await decideApproval(page, deniedApproval.id, "deny");
    await deniedTurn;
  } catch (error) {
    if (deniedApproval?.id) await decideApproval(page, deniedApproval.id, "deny").catch(() => undefined);
    await deniedTurn.catch(() => undefined);
    throw error;
  }
  await assertMissing(join(vantaDir, "hooks.json"));

  await runScenario(page, scenario({
    name: "credential-boundary",
    tools: [
      { name: "read_file", id: "trust-env-read", args: { path: ".env" } },
      { name: "read_file", id: "trust-audit-key-read", args: { path: ".vanta/audit.key" } },
      { name: "read_file", id: "trust-audit-events-read", args: { path: ".vanta/events.jsonl" } },
      { name: "shell_cmd", id: "trust-secret-shell", args: { command: "cat .env; cat .vanta/audit.key; printf compromised > .env" } },
    ],
    finalText: "TRUST_CREDENTIAL_BOUNDARY_OK",
    assertOutputs: (outputs) => {
      assert.deepEqual([...outputs].filter(([, value]) => value.includes(projectSecret)).map(([id]) => id), [], "project credential reached the model");
      assert.deepEqual([...outputs].filter(([, value]) => value.includes(auditSecret)).map(([id]) => id), [], "audit signing state reached the model");
      assert.match(outputs.get("trust-env-read") ?? "", /protected project credential|denied|blocked.*secret/i);
      assert.match(outputs.get("trust-audit-key-read") ?? "", /protected kernel authentication or audit state|denied|blocked.*secret/i);
      assert.match(outputs.get("trust-audit-events-read") ?? "", /protected kernel authentication or audit state|denied|blocked.*secret/i);
      assert.doesNotMatch(outputs.get("trust-secret-shell") ?? "", new RegExp(`${projectSecret}|${auditSecret}`));
    },
  }));
  assert.equal(await readFile(envPath, "utf8"), `PROJECT_TOKEN=${projectSecret}\n`);
  assert.equal(await readFile(auditKeyPath, "utf8"), `${auditSecret}\n`);

  const approved = scenario({
    name: "hook-approved",
    tools: [{ name: "write_file", id: "trust-hook-approved", args: { path: ".vanta/hooks.json", content: hookContent } }],
    finalText: "TRUST_HOOK_APPROVED_OK",
    assertOutputs: (outputs) => assert.match(outputs.get("trust-hook-approved") ?? "", /verified.*on disk/i),
  });
  const approvedTurn = runScenario(page, approved, { decision: "allow" });
  void approvedTurn.catch(() => undefined);
  let approvedApproval;
  try {
    approvedApproval = await waitForApproval(page);
    assertExactHookApproval(approvedApproval);
    await decideApproval(page, approvedApproval.id, "allow");
    await approvedTurn;
  } catch (error) {
    if (approvedApproval?.id) await decideApproval(page, approvedApproval.id, "deny").catch(() => undefined);
    await approvedTurn.catch(() => undefined);
    throw error;
  }
  assert.equal(await readFile(join(vantaDir, "hooks.json"), "utf8"), hookContent);

  await runScenario(page, scenario({
    name: "same-run-boundary",
    tools: [{ name: "write_file", id: "trust-same-run-write", args: { path: "same-run-proof.txt", content: "same run\n" } }],
    finalText: "TRUST_SAME_RUN_BOUNDARY_OK",
    assertOutputs: (outputs) => assert.match(outputs.get("trust-same-run-write") ?? "", /verified.*on disk/i),
  }));
  assert.equal(await readFile(sameRunPath, "utf8"), "same run\n");
  await assertMissing(activationPath);

  await closeApp();
  ({ app, page } = await launch(secondUserData, 7861));
  await setFullAccess(page);
  await runScenario(page, scenario({
    name: "restart-activation",
    tools: [{ name: "write_file", id: "trust-restart-write", args: { path: "restart-proof.txt", content: "after restart\n" } }],
    finalText: "TRUST_RESTART_ACTIVATION_OK",
    assertOutputs: (outputs) => assert.match(outputs.get("trust-restart-write") ?? "", /verified.*on disk/i),
  }));
  assert.equal(await readFile(restartPath, "utf8"), "after restart\n");
  assert.equal(await readFile(activationPath, "utf8"), "activated");

  const toolEffects = parseJsonLines(await readFile(join(vantaDir, "tool-effects.jsonl"), "utf8"));
  const receipts = parseJsonLines(await readFile(join(vantaDir, "action-receipts.jsonl"), "utf8"));
  const approvals = parseJsonLines(await readFile(join(vantaDir, "approvals.jsonl"), "utf8"));
  const requiredToolCallIds = [
    "trust-hook-denied",
    "trust-env-read",
    "trust-audit-key-read",
    "trust-audit-events-read",
    "trust-secret-shell",
    "trust-hook-approved",
    "trust-same-run-write",
    "trust-restart-write",
  ];
  assertReceiptCorpus({ toolEffects, receipts, requiredToolCallIds, forbiddenValues: [projectSecret, auditSecret] });
  const hookApprovals = approvals.filter((entry) => /:trust-hook-(?:denied|approved):approval$/.test(entry.id));
  assert.deepEqual(hookApprovals.map((entry) => entry.state), ["requested", "denied", "requested", "approved"]);
  assert.deepEqual(new Set(hookApprovals.map((entry) => entry.actionSha256)), new Set([sha256(deniedApproval.action), sha256(approvedApproval.action)]));
  assert.equal(receipts.find((entry) => entry.workItemId.endsWith(":trust-hook-denied"))?.disposition, "denied");

  process.stdout.write(`${JSON.stringify({
    ok: true,
    packaged: true,
    syntheticProvider: true,
    hostileDesktopRequests: 9,
    secretExposure: 0,
    secretMutation: 0,
    hookPayloadSha256: hookDigest,
    exactApprovalTransitions: hookApprovals.length,
    sameRunActivation: false,
    restartActivation: true,
    requiredToolReceipts: requiredToolCallIds.length,
    retainedToolTransitions: toolEffects.length,
    retainedActionReceipts: receipts.length,
  })}\n`);
} finally {
  await closeApp();
  await new Promise((resolveClose) => provider.close(resolveClose));
  await Promise.all([
    rm(home, { recursive: true, force: true }),
    rm(project, { recursive: true, force: true }),
    rm(firstUserData, { recursive: true, force: true }),
    rm(secondUserData, { recursive: true, force: true }),
  ]);
}

function scenario(value) {
  const current = { ...value, requests: 0 };
  scenarios.set(current.name, current);
  return current;
}

async function runScenario(targetPage, current, approval = undefined) {
  activeScenario = current;
  const result = await targetPage.evaluate(async ({ name, decisionExpected }) => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" },
      body: JSON.stringify({ message: `Execute synthetic TRUST-02 scenario ${name}${decisionExpected ? ` with ${decisionExpected}` : ""}.` }),
    });
    return { status: response.status, body: await response.json() };
  }, { name: current.name, decisionExpected: approval?.decision });
  assert.equal(result.status, 200, `${current.name} chat request failed`);
  assert.equal(current.requests, 2, `${current.name} did not complete one tool round trip`);
  if (current.outputError) throw current.outputError;
  assert.ok(String(result.body.finalText ?? "").includes(current.finalText), `${current.name} final text did not match the synthetic provider receipt`);
  return result.body;
}

async function launch(userData, port) {
  const launched = await electron.launch({
    executablePath,
    args: ["--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VANTA_HOME: home,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: String(port),
      VANTA_DESKTOP_AUTOMATION: "1",
      VANTA_PROVIDER: "custom",
      VANTA_OPENAI_BASE_URL: providerBaseUrl,
      VANTA_MODEL: "trust-02-proof",
      VANTA_MCP_AUTO_MOUNT: "0",
      VANTA_ENABLE_PROJECT_HOOKS: "1",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const targetPage = await launched.firstWindow();
  targetPage.setDefaultTimeout(60_000);
  await targetPage.locator(".app-shell").waitFor();
  const runtimeRoot = await targetPage.evaluate(async () => {
    const response = await fetch("/api/status", { headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" } });
    return (await response.json()).root;
  });
  assert.equal(runtimeRoot, project, "packaged Desktop did not open the disposable proof project");
  return { app: launched, page: targetPage };
}

async function setFullAccess(targetPage) {
  const result = await targetPage.evaluate(async () => {
    const response = await fetch("/api/access-mode", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" },
      body: JSON.stringify({ mode: "full" }),
    });
    return { status: response.status, body: await response.json() };
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.mode, "full");
}

async function waitForApproval(targetPage) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const approval = await targetPage.evaluate(async () => {
      const response = await fetch("/api/approval", { headers: { "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" } });
      const body = response.ok ? await response.json() : null;
      return body?.id ? body : null;
    });
    if (approval) return approval;
    await targetPage.waitForTimeout(100);
  }
  throw new Error("timed out waiting for exact Desktop approval");
}

async function decideApproval(targetPage, id, decision) {
  const result = await targetPage.evaluate(async ({ approvalId, approvalDecision }) => {
    const response = await fetch("/api/approval", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vanta-desktop-boundary": window.vantaDesktop?.boundaryToken ?? "" },
      body: JSON.stringify({ id: approvalId, decision: approvalDecision }),
    });
    return { status: response.status, body: await response.json() };
  }, { approvalId: id, approvalDecision: decision });
  assert.deepEqual(result, { status: 200, body: { ok: true } });
}

function assertExactHookApproval(approval) {
  assert.equal(approval.toolName, "write_file");
  assert.match(approval.action, /Modify project control-plane file \.vanta\/hooks\.json/);
  assert.match(approval.action, new RegExp(`${Buffer.byteLength(hookContent)} bytes`));
  assert.match(approval.action, new RegExp(`sha256 ${hookDigest}`));
  assert.match(approval.reason, /fresh exact confirmation/);
}

async function closeApp() {
  if (!app) return;
  const child = app.process();
  await Promise.race([app.close(), new Promise((resolveClose) => setTimeout(resolveClose, 3_000))]);
  if (child && !child.killed) child.kill("SIGKILL");
  app = undefined;
  page = undefined;
}

async function assertMissing(path) {
  await assert.rejects(readFile(path, "utf8"), (error) => error?.code === "ENOENT");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function streamTools(response, tools, id) {
  stream(response, [{
    role: "assistant",
    tool_calls: tools.map((tool, index) => ({
      index,
      id: tool.id,
      type: "function",
      function: { name: tool.name, arguments: JSON.stringify(tool.args) },
    })),
  }], "tool_calls", id);
}

function streamText(response, text, id) {
  stream(response, [{ role: "assistant", content: text }], "stop", id);
}

function stream(response, deltas, finishReason, id) {
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  for (const delta of deltas) response.write(`data: ${JSON.stringify(chunk(delta, null, id))}\n\n`);
  response.write(`data: ${JSON.stringify(chunk({}, finishReason, id))}\n\n`);
  response.write(`data: ${JSON.stringify({ ...chunk({}, null, id), choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`);
  response.end("data: [DONE]\n\n");
}

function chunk(delta, finishReason, id) {
  return { id, object: "chat.completion.chunk", created: 1, model: "trust-02-proof", choices: [{ index: 0, delta, finish_reason: finishReason }] };
}

function json(response, body) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
