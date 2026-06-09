import type { Entry, ToolEntry } from "./transcript.js";

// TUI-SMOOTH — pure render rules for the activity feed. Computes a clean
// { icon, verb, detail } from a tool's structured args at DISPATCH time, so the
// transcript never sees raw JSON or temp paths. Design note: docs/tui-smooth-design.md.

const HOME = process.env.HOME ?? "";
const TEMP_MARKERS = ["/var/folders", "/tmp/", "NSIRD", "/T/"];

const trunc = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * CC-BASH-COMMENT-LABEL: extract the display label from the first `# label`
 * comment line of a shell command. Returns null when the command has no comment.
 */
export function bashLabel(cmd: string): string | null {
  const first = (cmd.trim().split("\n")[0] ?? "").trim();
  if (!first.startsWith("#")) return null;
  const label = first.slice(1).trim();
  return label || null;
}

/** Abbreviate a path: temp dirs → basename, $HOME → ~, deep paths → …/last/two. */
export function abbrevPath(p: string): string {
  if (!p) return "";
  if (TEMP_MARKERS.some((m) => p.includes(m))) {
    return p.split("/").filter(Boolean).pop() ?? p;
  }
  let s = p;
  if (HOME && s.startsWith(HOME)) s = `~${s.slice(HOME.length)}`;
  if (s.startsWith("~")) return s;
  const segs = s.split("/").filter(Boolean);
  if (segs.length <= 2) return s;
  return `…/${segs.slice(-2).join("/")}`;
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return abbrevPath(url);
  }
}

/** Compact an unknown tool's args to `key:val` pairs — never raw JSON. */
function compactArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    let val: string;
    if (typeof v === "string") val = abbrevPath(v);
    else if (typeof v === "number" || typeof v === "boolean") val = String(v);
    else val = "…";
    parts.push(`${k}:${trunc(val, 24)}`);
  }
  return trunc(parts.join(" "), 50);
}

export type ToolDisplay = { icon: string; verb: string; detail: string };

/** Clean display parts for a tool call. Detail comes from ARGS, never raw output. */
export function toolDisplay(name: string, args: Record<string, unknown>): ToolDisplay {
  const str = (k: string): string => (typeof args[k] === "string" ? (args[k] as string) : "");
  switch (name) {
    case "read_file":
      return { icon: "📖", verb: "read", detail: abbrevPath(str("path")) };
    case "write_file":
      return { icon: "✎", verb: "wrote", detail: abbrevPath(str("path")) };
    case "shell_cmd": {
      const label = bashLabel(str("command"));
      return { icon: "❯", verb: "ran", detail: label ?? trunc(str("command"), 60) };
    }
    case "run_code":
      return { icon: "▶", verb: "ran", detail: str("language") };
    case "web_search":
      return { icon: "🔎", verb: "searched", detail: trunc(str("query"), 60) };
    case "web_fetch":
      return { icon: "🌐", verb: "fetched", detail: host(str("url")) };
    case "browser_navigate":
      return { icon: "🌐", verb: "opened", detail: host(str("url")) };
    case "browser_extract":
      return { icon: "🌐", verb: "read page", detail: "" };
    case "look_at_screen":
    case "screenshot":
      return { icon: "📸", verb: "saw screen", detail: "" };
    case "look_at_camera":
      return { icon: "📷", verb: "saw camera", detail: "" };
    case "watch_video":
      return { icon: "🎬", verb: "watched", detail: abbrevPath(str("path")) };
    case "describe_image":
      return { icon: "🖼", verb: "saw", detail: abbrevPath(str("path")) };
    case "speak":
      return { icon: "🔊", verb: "spoke", detail: "" };
    case "transcribe":
      return { icon: "🎙", verb: "transcribed", detail: "" };
    case "recall":
      return { icon: "🧠", verb: "recalled", detail: trunc(str("query"), 50) };
    case "write_skill":
      return { icon: "🧩", verb: "learned", detail: str("name") };
    case "brain":
      return { icon: "🧠", verb: str("action") || "brain", detail: str("region") };
    case "delegate":
      return { icon: "🤝", verb: "delegated", detail: trunc(str("goal") || str("prompt"), 50) };
    case "swarm":
      return { icon: "🐝", verb: "swarm", detail: "" };
    case "todo":
      return { icon: "☑", verb: "todo", detail: "" };
    case "inspect_state":
      return { icon: "🔍", verb: "inspected", detail: "" };
    case "mount_mcp":
      return { icon: "🔌", verb: "mounted", detail: str("name") };
  }
  if (name.startsWith("git_")) return { icon: "⎇", verb: "git", detail: name.slice(4) };
  if (name.startsWith("gmail_")) return { icon: "✉", verb: "gmail", detail: name.slice(6) };
  if (name.startsWith("calendar_")) return { icon: "📅", verb: "calendar", detail: name.slice(9) };
  if (name.startsWith("drive_")) return { icon: "📁", verb: "drive", detail: name.slice(6) };
  if (name.startsWith("lsp_")) return { icon: "🔧", verb: "lsp", detail: name.slice(4) };
  return { icon: "•", verb: name, detail: compactArgs(args) };
}

export type Block = { type: "single"; entry: Exclude<Entry, ToolEntry> } | { type: "tools"; items: ToolEntry[] };

/** Group a run of consecutive tool entries into one block — a turn's activity cluster. */
export function partitionBlocks(entries: Entry[]): Block[] {
  const blocks: Block[] = [];
  for (const e of entries) {
    if (e.kind === "tool") {
      const last = blocks[blocks.length - 1];
      if (last && last.type === "tools") last.items.push(e);
      else blocks.push({ type: "tools", items: [e] });
    } else {
      blocks.push({ type: "single", entry: e });
    }
  }
  return blocks;
}
