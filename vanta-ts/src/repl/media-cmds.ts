import { basename, join } from "node:path";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { mimeFromPath } from "./format.js";
import { readClipboardImage } from "../term/clipboard-image.js";
import type { SlashHandler } from "./types.js";

export const image: SlashHandler = async (arg, ctx) => {
  if (!arg) return { output: "  usage: /image <path>" };
  try {
    const { readFile } = await import("node:fs/promises");
    const abs = arg.startsWith("~") ? join(homedir(), arg.slice(1)) : arg;
    const buf = await readFile(abs);
    const mime = mimeFromPath(abs);
    (ctx.state.pendingImages ??= []).push({ mime, dataBase64: buf.toString("base64") });
    return { output: `  ◫  attached ${basename(abs)} (${mime}, ${Math.round(buf.length / 1024)}KB) — send a message to ask about it` };
  } catch (err) {
    return { output: `  could not read image: ${(err as Error).message.split("\n")[0]}` };
  }
};

export const paste: SlashHandler = async (_arg, ctx) => {
  const img = await readClipboardImage();
  if (!img) return { output: "  (no image on the clipboard — copy one, or use /image <path>; macOS only)" };
  (ctx.state.pendingImages ??= []).push(img);
  const kb = Math.round((img.dataBase64.length * 0.75) / 1024);
  return { output: `  ◫  pasted clipboard image (${kb}KB) — send a message to ask about it` };
};

export const copy: SlashHandler = async (_arg, ctx) => {
  const last = [...ctx.convo.messages].reverse().find((m) => m.role === "assistant" && m.content.trim());
  if (!last || last.role !== "assistant") return { output: "  (nothing to copy)" };
  try {
    const { spawn } = await import("node:child_process");
    const p = spawn("pbcopy");
    p.stdin.end(last.content);
    return { output: "  📋 copied the last response to the clipboard" };
  } catch {
    return { output: "  copy failed (pbcopy unavailable)" };
  }
};

export const update: SlashHandler = async (_arg, ctx) => {
  const repoRoot = dirname(ctx.dataDir);
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { stdout } = await promisify(execFile)("git", ["-C", repoRoot, "pull", "--ff-only"]);
    return { output: `  ⬆ ${stdout.trim() || "already up to date"}\n  · run ./install.sh to rebuild if anything changed` };
  } catch (err) {
    return { output: `  update failed: ${(err as Error).message.split("\n")[0]}` };
  }
};
