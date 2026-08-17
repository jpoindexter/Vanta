import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createDesktopServer } from "../src/desktop/server.ts";
import { executeEffect, payloadSha256 } from "../src/effects/execute-effect.ts";

const exec = promisify(execFile);
const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const root = await mkdtemp(join(tmpdir(), "vanta-op-01-proof-root-"));
const home = await mkdtemp(join(tmpdir(), "vanta-op-01-proof-home-"));
const data = join(root, ".vanta");
const at = "2026-08-04T10:00:00.000Z";
const env = { ...process.env, VANTA_HOME: home, VANTA_PROJECT_ROOT: root, VANTA_NO_TUI: "1" };
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const line = (value) => `${JSON.stringify(value)}\n`;

await mkdir(join(data, "kanban"), { recursive: true });
await mkdir(join(home, "sessions"), { recursive: true });
await mkdir(join(home, "runs"), { recursive: true });
await writeFile(join(root, "brief.md"), "- [ ] Verify the continuity closure\n");
await writeFile(join(home, "team-tasks.jsonl"), line({ kind: "task", id: "task-1", workerId: "worker", title: "Resume the operator proof", status: "blocked", blocker: "Needs operator", created: at, updated: at }));
await writeFile(join(data, "tickets.json"), json({ version: 1, tickets: [{ id: "ticket-1", title: "Verify the slice", status: "done", inbox: "read", links: {}, labels: [], comments: [], attachments: [], createdAt: at, updatedAt: at }] }));
await writeFile(join(data, "scheduled_tasks.json"), json({ tasks: [{ id: 1, cron: "0 9 * * *", instruction: "Review receipts", status: "active", durable: true, recurring: true }] }));
await writeFile(join(home, "sessions", "session-1.json"), json({ id: "session-1", title: "Interrupted operator slice", started: at, updated: at, messages: [{ role: "user", content: "Continue" }] }));
await writeFile(join(home, "runs", "run-library-1.json"), json({ version: 1, id: "run-library-1", sessionId: "session-1", turnIndex: 0, title: "Interrupted run", prompt: "Continue", projectRoot: root, startedAt: at, completedAt: at, status: "interrupted", saved: true, tags: [], provenance: "captured", lineage: { mode: "original" }, inputs: [], events: [], finalOutput: "" }));
await writeFile(join(data, "kanban", "board-1.json"), json({ id: "board-1", goal: "Prove OP-01", created: at, updated: at, swarmRuns: [], lanes: [{ id: "lane-1", title: "Operator approval", instruction: "Approve", status: "blocked", blocker: "Needs approval", requiredSkills: [], dependencies: [], evidence: [], wakePolicy: "manual", retries: 0, handoffs: [], updated: at }] }));

async function manifest(paths) {
  return Promise.all(paths.map(async (path) => [path, createHash("sha256").update(await readFile(path)).digest("hex")]));
}

const legacySources = [
  join(root, "brief.md"), join(home, "team-tasks.jsonl"), join(data, "tickets.json"), join(data, "scheduled_tasks.json"),
  join(home, "sessions", "session-1.json"), join(home, "runs", "run-library-1.json"), join(data, "kanban", "board-1.json"),
];
const before = await manifest(legacySources);

async function withDesktop(operation) {
  const server = createDesktopServer(root, { env });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  try {
    return await operation(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const post = (base, body) => fetch(`${base}/api/continuity`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "op-01-proof" }, body: JSON.stringify(body) });
const captured = await withDesktop(async (base) => {
  const capture = await post(base, { action: "capture", text: "Close the OP-01 continuity slice", sourcePath: "brief.md" });
  assert.equal(capture.status, 201);
  const body = await capture.json();
  const executed = await post(base, { action: "do_it", id: body.item.id });
  assert.equal(executed.status, 200);
  assert.equal((await executed.json()).item.state, "waiting");
  return body.item.id;
});

const resumedDesktop = await withDesktop(async (base) => {
  const response = await fetch(`${base}/api/continuity`);
  assert.equal(response.status, 200);
  return response.json();
});
assert.equal(resumedDesktop.reentry?.itemId, captured);
assert.equal(resumedDesktop.reentry?.action, "Verify the continuity closure");
assert.equal(resumedDesktop.operator.workItems.find((record) => record.source.id === captured)?.item.resumeContext.includes("Verify the continuity closure"), true);

let providerCalls = 0;
const effect = await executeEffect({
  id: "effect-1", actor: "proof", host: "synthetic", kind: "message.send", action: "send one synthetic OP-01 result",
  targetClass: "synthetic-recipient", payloadSha256: payloadSha256("op-01-proof"), idempotencyKey: "op-01:effect:1",
}, {
  kernel: { assess: async () => ({ risk: "ask", reason: "exact synthetic send approval" }) },
  approval: { request: async () => true }, projectRoot: root, sessionId: "op-01-proof", permissionMode: "default",
}, async () => { providerCalls += 1; return { acknowledgementId: "synthetic-ack-1", readbackSha256: payloadSha256("readback"), verified: true }; });
assert.equal(effect.outcome, "verified");
assert.equal(providerCalls, 1);

const finalDesktop = await withDesktop(async (base) => {
  const response = await fetch(`${base}/api/continuity`);
  assert.equal(response.status, 200);
  return response.json();
});
const restartedDesktop = await withDesktop(async (base) => (await fetch(`${base}/api/continuity`)).json());
assert.equal(finalDesktop.operator.digest, restartedDesktop.operator.digest, "Desktop restart changed the operator digest");
assert.equal(finalDesktop.operator.readOnly, true);
assert.equal(finalDesktop.operator.views.done.length, 1, "verified effect did not enter Done");
assert.equal(finalDesktop.operator.accomplishments.length, 1, "verified effect did not become the sole accomplishment");
assert(finalDesktop.operator.views.needsYou.length >= 2, "blocked sources were not projected into Needs You");
assert(finalDesktop.operator.views.waiting.length >= 3, "schedule/session/run/continuity resume records were not projected into Waiting");
assert(finalDesktop.operator.approvals.some((approval) => approval.state === "approved"));
assert(finalDesktop.operator.receipts.some((receipt) => receipt.disposition === "confirmed" && receipt.verification === "verified"));

const cli = await exec("npm", ["exec", "--", "tsx", "src/cli.ts", "operator-spine"], { cwd: sourceRoot, env, timeout: 30_000 });
assert.match(cli.stdout, /Operator spine: OK \(read-only\)/);
assert.match(cli.stdout, new RegExp(`Digest: ${finalDesktop.operator.digest}`));

const after = await manifest(legacySources);
assert.deepEqual(after, before, "Desktop/TUI projection modified a source store");

console.log(JSON.stringify({
  status: "PASS",
  desktop: { restarts: 3, resumeAction: resumedDesktop.reentry.action, digest: finalDesktop.operator.digest },
  tui: { command: "/operator-spine via exact CLI bridge", exit: 0, sameDigest: true },
  effect: { approval: "approved", providerCalls, receipt: "confirmed/verified" },
  views: Object.fromEntries(Object.entries(finalDesktop.operator.views).map(([key, value]) => [key, value.length])),
  sources: finalDesktop.operator.sources.map((source) => ({
    kind: source.kind,
    status: source.status,
    sourceCount: source.sourceCount,
    projectedCount: source.projectedCount,
    sourceSha256: source.sourceSha256,
    projectionSha256: source.projectionSha256,
  })),
  legacySourceBytesUnchanged: true,
}));
