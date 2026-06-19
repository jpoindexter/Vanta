import { join } from "node:path";
import { homedir } from "node:os";
import type { Message, ImageAttachment } from "../types.js";

/** Infer an image MIME type from a file path's extension. */
export function mimeFromPath(p: string): string {
  const ext = p.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  };
  return map[ext] ?? "image/png";
}

/**
 * If `input` is just a path to an existing image file (the common case when you
 * drag a file into the terminal — it inserts the path, possibly quoted or with
 * backslash-escaped spaces), read it and return an attachment. Else null. This
 * gives the "drag an image in and it just works" flow on top of /image.
 */
export async function maybeDroppedImage(input: string): Promise<ImageAttachment | null> {
  let s = input.trim();
  if (s.length < 5 || s.includes("\n")) return null;
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) s = s.slice(1, -1);
  s = s.replace(/\\ /g, " ");
  if (s.startsWith("~")) s = join(homedir(), s.slice(1));
  if (!/\.(png|jpe?g|gif|webp)$/i.test(s)) return null;
  try {
    const { readFile } = await import("node:fs/promises");
    const buf = await readFile(s);
    return { mime: mimeFromPath(s), dataBase64: buf.toString("base64") };
  } catch {
    return null; // not a readable file — treat as ordinary text
  }
}

/** True if `line` (after stripping outer quotes + escaped spaces) ends in an image extension. */
export function isImageFilePath(line: string): boolean {
  let s = line.trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) s = s.slice(1, -1);
  return /\.(png|jpe?g|gif|webp)$/i.test(s.replace(/\\ /g, " "));
}

/**
 * Split a pasted blob into image-file-path lines and the leftover text. Terminals
 * deliver a pasted/dragged image as its path, so pasting a path AND typing a
 * question land in one message. Splitting on newlines — and on a space that
 * precedes an absolute path (multi-image drag from Finder, where in-path spaces
 * are backslash-escaped) — lets us attach the images and keep the question as the
 * prompt instead of sending the raw path as blind text.
 */
export function splitPastedImagePaths(pasted: string): { imagePaths: string[]; rest: string } {
  const lines = pasted
    .split(/ (?=\/|[A-Za-z]:\\)/)
    .flatMap((p) => p.split("\n"))
    .filter((l) => l.trim());
  return {
    imagePaths: lines.filter(isImageFilePath),
    rest: lines.filter((l) => !isImageFilePath(l)).join("\n").trim(),
  };
}

/** A macOS temp image preview path (screenshot/paste) — its bytes also live on the clipboard. */
export function looksLikeTempImagePath(text: string): boolean {
  return /\/(TemporaryItems|var\/folders)\/.*\.(png|jpe?g|gif|webp)/i.test(text);
}

/**
 * If `input` is a path to an existing video file, return the resolved absolute
 * path. Else null. Mirrors `maybeDroppedImage` — covers the drag-a-video-in flow.
 */
export async function maybeDroppedVideo(input: string): Promise<string | null> {
  let s = input.trim();
  if (s.length < 5 || s.includes("\n")) return null;
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) s = s.slice(1, -1);
  s = s.replace(/\\ /g, " ");
  if (s.startsWith("~")) s = join(homedir(), s.slice(1));
  if (!/\.(mp4|mov|avi|mkv|webm|m4v|flv|wmv)$/i.test(s)) return null;
  try {
    const { access } = await import("node:fs/promises");
    await access(s);
    return s;
  } catch {
    return null;
  }
}

/** Collapse whitespace and cap a string for one-line display. */
export function oneLine(s: string, max = 200): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Index of the last user message, or -1 if there isn't one. */
export function lastUserIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.role === "user") return i;
  return -1;
}

/** Index of the last assistant message, or -1 if there isn't one. */
export function lastAssistantIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.role === "assistant") return i;
  return -1;
}

/** Full-fidelity markdown export of a conversation (no truncation) for `/export`. */
export function formatExport(messages: Message[]): string {
  const out: string[] = [];
  for (const m of messages) {
    if (m.role === "user") out.push(`## You\n\n${m.content}`);
    else if (m.role === "assistant") {
      const calls = m.toolCalls?.length ? `\n\n${m.toolCalls.map((tc) => `- \`${tc.name}(${JSON.stringify(tc.arguments)})\``).join("\n")}` : "";
      if (m.content.trim() || calls) out.push(`## Vanta\n\n${m.content}${calls}`);
    } else if (m.role === "tool") out.push(`### ⚙ ${m.name}\n\n\`\`\`\n${m.content}\n\`\`\``);
  }
  return out.join("\n\n");
}

/** Render the live transcript (skipping the system message) for `/history`. */
export function formatHistory(messages: Message[]): string {
  const out: string[] = [];
  for (const m of messages) {
    if (m.role === "user") out.push(`  you  › ${oneLine(m.content)}`);
    else if (m.role === "assistant") {
      if (m.content.trim()) out.push(`  vanta › ${oneLine(m.content)}`);
      for (const tc of m.toolCalls ?? []) out.push(`    ⚙ ${tc.name}(${oneLine(JSON.stringify(tc.arguments), 80)})`);
    } else if (m.role === "tool") out.push(`    ↳ ${m.name}: ${oneLine(m.content, 120)}`);
  }
  return out.join("\n");
}

/** Join lines, or show a fallback when empty. */
export function lines(items: string[], empty: string): string {
  return items.length ? items.join("\n") : empty;
}
