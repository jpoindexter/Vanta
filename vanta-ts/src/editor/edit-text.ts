import { writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { resolveEditor } from "./open.js";

export type EditResult =
  | { ok: true; text: string; message: string }
  | { ok: false; message: string };

/**
 * Build the argv for opening `file` in the configured editor and blocking
 * until the editor closes. VS Code-family and Sublime need `--wait`; terminal
 * editors (vim/nano) block naturally via stdio:'inherit'.
 */
export function editCommand(editor: string, file: string): { cmd: string; args: string[] } {
  const tokens = editor.split(/\s+/);
  const cmd = tokens[0]!;
  const name = (cmd.split("/").pop() ?? cmd).toLowerCase();
  if (/^(code|code-insiders|cursor|codium|vscodium|windsurf)$/.test(name))
    return { cmd, args: ["--wait", file] };
  if (/^(subl|sublime_text|sublime)$/.test(name))
    return { cmd, args: ["--wait", file] };
  return { cmd, args: [...tokens.slice(1), file] };
}

/**
 * Open `text` in the configured editor, wait for the editor to close, then
 * return the modified content. Writes a temp `.md` file; cleans up after.
 *
 * Terminal editors (vim/nano) conflict with the Ink TUI — use a GUI editor
 * (`VANTA_EDITOR=code`) when running the TUI.
 */
export async function editText(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EditResult> {
  const file = join(tmpdir(), `vanta-edit-${Date.now()}.md`);
  await writeFile(file, text, "utf8");

  const editor = resolveEditor(env);
  const { cmd, args } = editCommand(editor, file);

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: "inherit" });
      child.on("close", (code) => {
        if (code === 0 || code === null) resolve();
        else reject(new Error(`editor exited with code ${String(code)}`));
      });
      child.on("error", reject);
    });

    const updated = await readFile(file, "utf8");
    return { ok: true, text: updated.trimEnd(), message: `edited (${updated.length} chars)` };
  } catch (e) {
    return { ok: false, message: (e instanceof Error ? e.message : String(e)).split("\n")[0]! };
  } finally {
    rm(file, { force: true }).catch(() => {});
  }
}
