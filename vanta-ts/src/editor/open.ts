// Editor open — open a referenced file:line in the user's editor. Pure parse +
// command building (testable); the spawn is the only side effect. Editor from
// VANTA_EDITOR > VISUAL > EDITOR, default `code` (Jason's stack is VS Code-like).

export type FileLine = { file: string; line: number };

/** Parse "path", "path:line", or "path:line:col" → file + line (col ignored). Pure. */
export function parseFileLine(ref: string): FileLine {
  const parts = ref.trim().split(":");
  let line = 1;
  if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1]!)) {
    const last = parts.pop()!;
    // "file:line:col" → drop col, take the next numeric as line; else last is line.
    if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1]!)) line = Number(parts.pop());
    else line = Number(last);
  }
  return { file: parts.join(":"), line };
}

/** Resolve the configured editor binary (+ any flags). Pure. */
export function resolveEditor(env: NodeJS.ProcessEnv = process.env): string {
  return (env.VANTA_EDITOR || env.VISUAL || env.EDITOR || "code").trim();
}

/** Build the argv that opens `file` at `line` for the given editor. Pure. */
export function editorCommand(editor: string, file: string, line: number): { cmd: string; args: string[] } {
  const tokens = editor.split(/\s+/);
  const cmd = tokens[0]!;
  const name = (cmd.split("/").pop() ?? cmd).toLowerCase();
  if (/^(code|code-insiders|cursor|codium|vscodium|windsurf)$/.test(name)) return { cmd, args: ["-g", `${file}:${line}`] };
  if (/^(vim|nvim|vi|nano|emacs|emacsclient|hx|helix|micro|kak)$/.test(name)) return { cmd, args: [`+${line}`, file] };
  if (/^(subl|sublime_text|sublime)$/.test(name)) return { cmd, args: [`${file}:${line}`] };
  // Unknown editor: pass any configured flags + the file (line isn't portable).
  return { cmd, args: [...tokens.slice(1), file] };
}

// VS Code-family editors expose a URL scheme that opens a file at a line; map the
// binary name → scheme so a clicked OSC-8 file link lands in the configured editor.
const EDITOR_SCHEMES: ReadonlyArray<{ match: RegExp; scheme: string }> = [
  { match: /^(code|code-insiders|codium|vscodium)$/, scheme: "vscode" },
  { match: /^cursor$/, scheme: "cursor" },
  { match: /^windsurf$/, scheme: "windsurf" },
];

/** The URL an OSC-8 file hyperlink should target for `absFile:line`. VS Code-family
 *  editors get their `scheme://file/<abs>:<line>` deep link (opens in $VANTA_EDITOR
 *  at the line); everything else gets a plain `file://` URL. Pure. `absFile` must
 *  be absolute. */
export function editorOpenUrl(editor: string, absFile: string, line: number): string {
  const name = (editor.split(/\s+/)[0]!.split("/").pop() ?? "").toLowerCase();
  const hit = EDITOR_SCHEMES.find((s) => s.match.test(name));
  const path = absFile.startsWith("/") ? absFile : `/${absFile}`;
  if (hit) return `${hit.scheme}://file${path}:${line}`;
  return `file://${path}`;
}

/** Open file:line in the configured editor. Returns a status line. */
export async function openInEditor(ref: string, env: NodeJS.ProcessEnv = process.env): Promise<{ ok: boolean; message: string }> {
  const { file, line } = parseFileLine(ref);
  if (!file) return { ok: false, message: "usage: vanta open <file[:line]>" };
  const { cmd, args } = editorCommand(resolveEditor(env), file, line);
  try {
    const { spawn } = await import("node:child_process");
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return { ok: true, message: `opened ${file}:${line} in ${cmd}` };
  } catch (e) {
    return { ok: false, message: `could not open ${file}: ${(e as Error).message.split("\n")[0]}` };
  }
}
