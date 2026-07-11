import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { verifyGithubSignature, type Deliver } from "../gateway/webhook.js";
import {
  appendWorkflowReceipt, listWorkflows, readWorkflowSecret, receipt, type WebhookWorkflow,
} from "./store.js";

export type WorkflowWebhookServer = { port: number; close: () => Promise<void> };

export type WorkflowRuntimeOpts = {
  port: number;
  dataDir: string;
  handle: (prompt: string) => Promise<string>;
  resolveDeliver: (target: string) => Deliver;
  log?: (message: string) => void;
};

const MAX_BODY_BYTES = 1_000_000;

export async function startWorkflowWebhookServer(opts: WorkflowRuntimeOpts): Promise<WorkflowWebhookServer> {
  const log = opts.log ?? ((message: string) => console.log(message));
  const server = createServer((request, response) => void routeRequest(request, response, opts, log));
  return new Promise((resolve) => server.listen(opts.port, () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : opts.port;
    log(`vanta gateway: workflow webhooks on :${port}`);
    resolve({ port, close: () => new Promise<void>((done) => server.close(() => done())) });
  }));
}

async function routeRequest(req: IncomingMessage, res: ServerResponse, opts: WorkflowRuntimeOpts, log: (message: string) => void): Promise<void> {
  if (req.method !== "POST") return void res.writeHead(405).end("method not allowed");
  const workflow = await enabledWorkflow(opts.dataDir, req.url ?? "");
  if (!workflow) return void res.writeHead(404).end("workflow not found or disabled");
  const body = await readBody(req);
  if (!body.ok) return void res.writeHead(413).end(body.error);
  const secret = await readWorkflowSecret(opts.dataDir, workflow.id);
  const signature = header(req, "x-hub-signature-256");
  if (!secret || !verifyGithubSignature(secret, body.text, signature)) return void res.writeHead(401).end("bad signature");
  await recordAccepted(opts.dataDir, workflow.id, body.text);
  res.writeHead(202).end("accepted");
  void executeWorkflow(workflow, body.text, opts).catch((error: unknown) => {
    log(`workflow webhook ${workflow.id}: ${error instanceof Error ? error.message : String(error)}`);
  });
}

async function enabledWorkflow(dataDir: string, url: string): Promise<WebhookWorkflow | null> {
  const path = new URL(url, "http://localhost").pathname;
  return (await listWorkflows(dataDir)).find((workflow) => workflow.enabled && workflow.route === path) ?? null;
}

async function executeWorkflow(workflow: WebhookWorkflow, body: string, opts: WorkflowRuntimeOpts): Promise<void> {
  try {
    const prompt = workflow.prompt.replace("{body}", body.slice(0, 4000));
    const output = await opts.handle(prompt);
    await opts.resolveDeliver(workflow.deliver)(output);
    await appendWorkflowReceipt(opts.dataDir, receipt({ workflowId: workflow.id, phase: "delivery", status: "delivered", detail: `${workflow.deliver} accepted output`, at: new Date().toISOString() }));
  } catch (error) {
    const failed = receipt({ workflowId: workflow.id, phase: "delivery", status: "failed", detail: (error as Error).message, at: new Date().toISOString() });
    await appendWorkflowReceipt(opts.dataDir, { ...failed, ok: false });
    throw error;
  }
}

async function recordAccepted(dataDir: string, workflowId: string, body: string): Promise<void> {
  const accepted = receipt({ workflowId, phase: "route", status: "accepted", detail: `${Buffer.byteLength(body)} bytes authenticated`, at: new Date().toISOString() });
  accepted.bodySha256 = createHash("sha256").update(body).digest("hex");
  await appendWorkflowReceipt(dataDir, accepted);
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readBody(req: IncomingMessage): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  let text = "";
  for await (const chunk of req) {
    text += Buffer.from(chunk).toString("utf8");
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) return { ok: false, error: "payload too large" };
  }
  return { ok: true, text };
}
