import { basename, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { dirname } from "node:path";
import { mimeFromPath } from "./format.js";
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
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { readFile, rm } = await import("node:fs/promises");
    const tmp = join(tmpdir(), `vanta-paste-${ctx.now().getTime()}.png`);
    const script = `set f to (open for access (POSIX file "${tmp}") with write permission)\ntry\nwrite (the clipboard as «class PNGf») to f\nend try\nclose access f`;
    await promisify(execFile)("osascript", ["-e", script]);
    const buf = await readFile(tmp).catch(() => Buffer.alloc(0));
    await rm(tmp, { force: true }).catch(() => {});
    if (!buf.length) return { output: "  (no image on the clipboard — copy one, or use /image <path>)" };
    (ctx.state.pendingImages ??= []).push({ mime: "image/png", dataBase64: buf.toString("base64") });
    return { output: `  ◫  pasted clipboard image (${Math.round(buf.length / 1024)}KB) — send a message to ask about it` };
  } catch (err) {
    return { output: `  paste failed (macOS only): ${(err as Error).message.split("\n")[0]} — try /image <path>` };
  }
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
