import type { Worker } from "../team/store.js";
import type { WorkerTask } from "../team/tasks.js";
import { decodeComment } from "./company-comments.js";
import type { CompanySnapshot } from "./company-snapshot.js";

const INSTRUCTION_MAX_CHARS = 6000;

/** What a worker is told: the ticket, the owner's thread (answers included), and any revision note. */
export function buildInstruction(snap: CompanySnapshot, worker: Worker, task: WorkerTask, note?: string): string {
  const ticket = snap.tickets.find((t) => t.id === task.id);
  const thread = (ticket?.comments ?? []).map((c) => {
    const d = decodeComment(c.text);
    return `- ${d.author}${d.kind === "answer" ? " (answer)" : ""}: ${d.text}`;
  });
  const lines = [
    `You are ${worker.role} ("${worker.id}") on the owner's team.`,
    `Ticket ${task.id}: ${task.title}`,
    ...(task.outcome ? [`Expected output: ${task.outcome.expectedOutput}`] : []),
    ...(thread.length ? ["Thread:", ...thread] : []),
    ...(note ? [`Latest instruction: ${note}`] : []),
    "Finish with a concise result the owner can review.",
  ];
  return lines.join("\n").slice(0, INSTRUCTION_MAX_CHARS);
}
