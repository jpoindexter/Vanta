import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { formatExport } from "../repl/format.js";
import type { Message } from "../types.js";

export type ExportFormat = "markdown" | "json" | "text";
export type ExportDestination = "file" | "clipboard";

export type ExportOptions = {
  format: ExportFormat;
  includeTools: boolean;
  includeThinking: boolean;
  destination: ExportDestination;
};

export type ExportContext = {
  sessionId: string;
  title?: string;
  messages: Message[];
};

export type ExportDialogData = {
  context: ExportContext;
  options: ExportOptions;
  body: string;
  preview: string[];
  file: string;
};

export type ExportResult = { ok: true; message: string; body: string; file?: string } | { ok: false; message: string };

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: "markdown",
  includeTools: true,
  includeThinking: false,
  destination: "file",
};

const PREVIEW_LINES = 8;

function exportExt(format: ExportFormat): string {
  return format === "markdown" ? "md" : format;
}

export function exportFilePath(repoRoot: string, sessionId: string, format: ExportFormat): string {
  return join(repoRoot, ".vanta", "exports", `${sessionId}.${exportExt(format)}`);
}

function stripThinking(content: string): string {
  return content
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .split("\n")
    .filter((line) => !/^\s*(?:thinking|reasoning)\s*:/i.test(line))
    .join("\n")
    .trim();
}

function visibleMessages(messages: Message[], options: ExportOptions): Message[] {
  return messages.flatMap((message): Message[] => {
    if (!options.includeTools && message.role === "tool") return [];
    if (message.role !== "assistant") return [message];
    const content = options.includeThinking ? message.content : stripThinking(message.content);
    const toolCalls = options.includeTools ? message.toolCalls : undefined;
    if (!content.trim() && (!toolCalls || toolCalls.length === 0)) return [];
    return [{ ...message, content, toolCalls }];
  });
}

function textExport(messages: Message[]): string {
  const out: string[] = [];
  for (const message of messages) {
    if (message.role === "user") out.push(`You: ${message.content}`);
    else if (message.role === "assistant") {
      if (message.content.trim()) out.push(`Vanta: ${message.content}`);
      for (const call of message.toolCalls ?? []) out.push(`Tool call: ${call.name}(${JSON.stringify(call.arguments)})`);
    } else if (message.role === "tool") out.push(`Tool result ${message.name}: ${message.content}`);
  }
  return out.join("\n\n");
}

export function renderConversationExport(context: ExportContext, options: ExportOptions): string {
  const messages = visibleMessages(context.messages, options);
  if (options.format === "json") return `${JSON.stringify({ sessionId: context.sessionId, title: context.title, messages }, null, 2)}\n`;
  if (options.format === "text") return `${textExport(messages)}\n`;
  return `# ${context.title ?? context.sessionId}\n\n${formatExport(messages)}\n`;
}

export function buildExportDialogData(repoRoot: string, context: ExportContext, options: ExportOptions = DEFAULT_EXPORT_OPTIONS): ExportDialogData {
  const body = renderConversationExport(context, options);
  return {
    context,
    options,
    body,
    preview: body.split("\n").slice(0, PREVIEW_LINES),
    file: exportFilePath(repoRoot, context.sessionId, options.format),
  };
}

export function nextExportFormat(format: ExportFormat): ExportFormat {
  if (format === "markdown") return "json";
  if (format === "json") return "text";
  return "markdown";
}

export function toggleExportDestination(destination: ExportDestination): ExportDestination {
  return destination === "file" ? "clipboard" : "file";
}

export async function copyToClipboard(text: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (env.VANTA_TEST_CLIPBOARD === "1") return;
  if (process.platform !== "darwin") throw new Error("clipboard export requires pbcopy on macOS");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pbcopy", []);
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`pbcopy exited ${code}`)));
    child.stdin.end(text);
  });
}

export async function writeConversationExport(repoRoot: string, data: ExportDialogData, env: NodeJS.ProcessEnv = process.env): Promise<ExportResult> {
  if (data.options.destination === "clipboard") {
    await copyToClipboard(data.body, env);
    return { ok: true, message: `copied ${data.options.format} export to clipboard`, body: data.body };
  }
  await mkdir(join(repoRoot, ".vanta", "exports"), { recursive: true });
  await writeFile(data.file, data.body, "utf8");
  return { ok: true, message: `exported ${data.options.format} to ${data.file}`, body: data.body, file: data.file };
}
