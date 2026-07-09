import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { InboundMessage } from "./platforms/base.js";
import type { ReplyBus } from "../permissions/reply-bus.js";

const RunStatusSchema = z.enum(["running", "done", "paused"]);
const MobileRunSchema = z.object({
  id: z.string().min(1),
  chatId: z.string().min(1),
  title: z.string().min(1),
  status: RunStatusSchema,
  work: z.string().optional(),
  startedAt: z.string(),
  updatedAt: z.string(),
});
const StoreSchema = z.object({
  version: z.literal(1),
  runs: z.array(MobileRunSchema),
});

export type MobileRun = z.infer<typeof MobileRunSchema>;
export type MobileControlResult = { consumed: boolean; reply?: string };

export function mobileControlPath(dataDir: string): string {
  return join(dataDir, "mobile-control.json");
}

export async function loadMobileRuns(dataDir: string): Promise<MobileRun[]> {
  try {
    const parsed = StoreSchema.safeParse(JSON.parse(await readFile(mobileControlPath(dataDir), "utf8")));
    return parsed.success ? parsed.data.runs : [];
  } catch {
    return [];
  }
}

async function saveMobileRuns(dataDir: string, runs: MobileRun[]): Promise<void> {
  const file = mobileControlPath(dataDir);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(StoreSchema.parse({ version: 1, runs }), null, 2) + "\n", "utf8");
}

export async function startMobileRun(dataDir: string, msg: InboundMessage, now = new Date()): Promise<MobileRun> {
  const at = now.toISOString();
  const run: MobileRun = {
    id: `run-${at.replace(/[:.]/g, "-")}`,
    chatId: msg.chatId,
    title: firstLine(msg.text) || "channel run",
    status: "running",
    startedAt: at,
    updatedAt: at,
  };
  await saveMobileRuns(dataDir, [run, ...(await loadMobileRuns(dataDir)).filter((r) => r.id !== run.id)].slice(0, 50));
  return run;
}

export async function finishMobileRun(dataDir: string, id: string, work: string, now = new Date()): Promise<void> {
  const at = now.toISOString();
  const runs = (await loadMobileRuns(dataDir)).map((r) => (
    r.id === id && r.status !== "paused" ? { ...r, status: "done" as const, work: firstLines(work), updatedAt: at } : r
  ));
  await saveMobileRuns(dataDir, runs);
}

export async function pauseMobileRun(dataDir: string, id: string, now = new Date()): Promise<boolean> {
  const at = now.toISOString();
  let found = false;
  const runs = (await loadMobileRuns(dataDir)).map((r) => {
    if (r.id !== id) return r;
    found = true;
    return { ...r, status: "paused" as const, updatedAt: at };
  });
  if (found) await saveMobileRuns(dataDir, runs);
  return found;
}

export async function handleMobileControlCommand(opts: {
  dataDir: string;
  msg: InboundMessage;
  replyBus?: Pick<ReplyBus, "tryConsume">;
  now?: Date;
}): Promise<MobileControlResult> {
  const parts = opts.msg.text.trim().split(/\s+/).filter(Boolean);
  const cmd = (parts[0] ?? "").toLowerCase();
  const arg = parts[1];
  if (cmd === "/runs") return { consumed: true, reply: formatRuns(await loadMobileRuns(opts.dataDir)) };
  if (cmd === "/work") return { consumed: true, reply: await formatWork(opts.dataDir, arg) };
  if (cmd === "/pause") return { consumed: true, reply: await pauseReply(opts.dataDir, arg, opts.now) };
  if (cmd === "/approve") return { consumed: true, reply: approveReply(opts.msg.chatId, arg, opts.replyBus) };
  return { consumed: false };
}

function formatRuns(runs: MobileRun[]): string {
  if (!runs.length) return "No mobile-controlled runs yet.";
  return ["Active runs", ...runs.slice(0, 10).map((r) => `${r.id} - ${r.status} - ${r.title}`)].join("\n");
}

async function formatWork(dataDir: string, id: string | undefined): Promise<string> {
  if (!id) return "Usage: /work <run-id>";
  const run = (await loadMobileRuns(dataDir)).find((r) => r.id === id);
  if (!run) return `Run not found: ${id}`;
  return run.work ? `${run.id} work:\n${run.work}` : `${run.id} has no completed work yet.`;
}

async function pauseReply(dataDir: string, id: string | undefined, now?: Date): Promise<string> {
  if (!id) return "Usage: /pause <run-id>";
  return await pauseMobileRun(dataDir, id, now) ? `Paused ${id}.` : `Run not found: ${id}`;
}

function approveReply(chatId: string, id: string | undefined, replyBus?: Pick<ReplyBus, "tryConsume">): string {
  if (!id) return "Usage: /approve <request-id>";
  if (!replyBus) return "No pending approval bus is active.";
  return replyBus.tryConsume({ chatId, text: `yes ${id}` }) ? `Approved ${id}.` : `Approval not pending: ${id}`;
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/).find(Boolean)?.trim() ?? "";
  return line.length > 80 ? `${line.slice(0, 77)}...` : line;
}

function firstLines(text: string): string {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 12).join("\n");
  return lines.length > 1200 ? `${lines.slice(0, 1197)}...` : lines;
}
