import type { Message } from "../types.js";
import type { Session } from "../sessions/store.js";
import { redactForLog } from "../store/redact-structural.js";
import type { RunInput, RunRecord } from "./store.js";

function filesFromMessages(messages: Message[]): RunInput[] {
  const files = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of message.toolCalls ?? []) {
      for (const key of ["path", "file_path", "target", "new_path"]) {
        const value = call.arguments[key];
        if (typeof value === "string" && value.trim()) files.add(value);
      }
    }
  }
  return [...files].map((path) => ({
    path: redactForLog(path),
    capture: "linked" as const,
    note: "Derived from a legacy transcript; original hash and attachment status are unavailable.",
  }));
}

export function deriveLegacyRuns(session: Session, projectRoot: string): RunRecord[] {
  const userIndexes = session.messages.flatMap((message, index) => message.role === "user" ? [index] : []);
  return userIndexes.map((start, turnIndex) => {
    const end = userIndexes[turnIndex + 1] ?? session.messages.length;
    const messages = session.messages.slice(start, end);
    const user = messages[0];
    const assistant = [...messages].reverse().find((message) => message.role === "assistant");
    const prompt = user?.role === "user" ? user.content : "";
    const finalOutput = assistant?.role === "assistant" ? assistant.content : "";
    const receipt = assistant?.role === "assistant" ? assistant.desktopRun : undefined;
    return {
      version: 1,
      id: `legacy-${session.id}-${turnIndex}`,
      sessionId: session.id,
      turnIndex,
      title: prompt.trim().replace(/\s+/g, " ").slice(0, 80) || session.title,
      prompt,
      projectRoot,
      providerId: session.providerId,
      modelId: session.modelId,
      startedAt: turnIndex === 0 ? session.started : session.updated,
      completedAt: session.updated,
      status: receipt?.status ?? (assistant ? "done" : "interrupted"),
      saved: false,
      tags: [],
      provenance: "derived",
      lineage: { mode: "original" },
      inputs: filesFromMessages(messages),
      events: (receipt?.events ?? []).map((event) => ({
        at: session.updated,
        kind: "note" as const,
        ok: event.ok,
        output: redactForLog(event.label),
      })),
      finalOutput,
    };
  });
}
