import { execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

const exec = promisify(execFile);

export type ChangedFile = {
  file: string;
  added: number;
  removed: number;
  status: "M" | "A" | "D" | "?";
};

type ExecResult = { stdout: string; stderr: string };

async function git(args: string[], opts: ExecFileOptions): Promise<string> {
  const { stdout } = (await exec("git", args, opts)) as ExecResult;
  return stdout;
}

function parseStatus(xy: string): ChangedFile["status"] {
  if (xy === "??") return "?";
  if (xy.includes("D")) return "D";
  if (xy.startsWith("A")) return "A";
  return "M";
}

/**
 * Files changed in the working tree vs HEAD (modified/added/deleted + untracked),
 * with per-file +/- line counts. Empty array on any git error or non-repo.
 */
export async function listChangedFiles(cwd: string): Promise<ChangedFile[]> {
  try {
    const statusOut = await git(["status", "--porcelain"], { cwd });
    if (!statusOut.trim()) return [];

    const entries = statusOut
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const xy = line.slice(0, 2);
        const file = line.slice(3).trim();
        return { file, status: parseStatus(xy) };
      });

    const numstatOut = await git(["diff", "--numstat", "HEAD"], { cwd }).catch(
      () => "",
    );

    const numstatMap = new Map<string, { added: number; removed: number }>();
    for (const line of numstatOut.split("\n").filter(Boolean)) {
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const [addedStr, removedStr, file] = parts as [string, string, string];
      numstatMap.set(file, {
        added: addedStr === "-" ? 0 : parseInt(addedStr, 10),
        removed: removedStr === "-" ? 0 : parseInt(removedStr, 10),
      });
    }

    return entries.map(({ file, status }) => ({
      file,
      status,
      added: numstatMap.get(file)?.added ?? 0,
      removed: numstatMap.get(file)?.removed ?? 0,
    }));
  } catch {
    return [];
  }
}

/**
 * The unified diff for one file (vs HEAD). For an untracked file, show its
 * contents as added lines. Returns "" on error.
 */
export async function fileDiff(cwd: string, file: string): Promise<string> {
  try {
    const diff = await git(["diff", "HEAD", "--", file], { cwd });
    if (diff.trim()) return diff;

    // Untracked or new file: read content and format as added lines
    const abs = join(cwd, file);
    const contents = await readFile(abs, "utf8").catch(() => null);
    if (contents === null) return "";

    return contents
      .split("\n")
      .map((l) => `+${l}`)
      .join("\n");
  } catch {
    return "";
  }
}

type UndoResult = { ok: true } | { ok: false; error: string };

/**
 * Undo one file: restore a tracked file to HEAD (git checkout), or delete an
 * untracked file. Returns { ok } or { ok:false, error }.
 */
export async function undoFile(cwd: string, file: string): Promise<UndoResult> {
  try {
    await git(["ls-files", "--error-unmatch", "--", file], { cwd });
    // Tracked — restore to HEAD
    await git(["checkout", "HEAD", "--", file], { cwd });
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If ls-files threw "did not match any file" the file is untracked
    if (msg.includes("did not match") || msg.includes("pathspec")) {
      try {
        await unlink(join(cwd, file));
        return { ok: true };
      } catch (unlinkErr: unknown) {
        return {
          ok: false,
          error: unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr),
        };
      }
    }
    return { ok: false, error: msg };
  }
}
