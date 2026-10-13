/** Pure parsers for the machine formats the read-only git runner asks for. */

export interface StatusEntry {
  conflicted: boolean;
  /** Index (staged) column, `.` when unchanged. */
  index: string;
  path: string;
  untracked: boolean;
  /** Working-tree column, `.` when unchanged. */
  worktree: string;
}

export interface ParsedStatus {
  ahead: number;
  behind: number;
  branch: null | string;
  detached: boolean;
  entries: StatusEntry[];
}

const TRACKED_FIELDS = 8; // "1 XY sub mH mI mW hH hI <path>"
const RENAME_FIELDS = 9; // "2 XY sub mH mI mW hH hI Xscore <path>"
const CONFLICT_FIELDS = 10; // "u XY sub m1 m2 m3 mW h1 h2 h3 <path>"

function splitFields(record: string, fields: number): string[] {
  const parts: string[] = [];
  let rest = record;

  for (let index = 0; index < fields; index += 1) {
    const space = rest.indexOf(" ");
    parts.push(rest.slice(0, space));
    rest = rest.slice(space + 1);
  }

  parts.push(rest);

  return parts;
}

function applyHeader(status: ParsedStatus, header: string): void {
  const [key = "", value = ""] = header.slice(2).split(/ (.*)/s);

  if (key === "branch.head") {
    status.detached = value === "(detached)";
    status.branch = status.detached ? null : value;
  } else if (key === "branch.ab") {
    const match = /^\+(\d+) -(\d+)$/.exec(value);
    status.ahead = match ? Number(match[1]) : 0;
    status.behind = match ? Number(match[2]) : 0;
  }
}

/** `git status --porcelain=v2 --branch -z`. */
export function parseStatus(stdout: string): ParsedStatus {
  const status: ParsedStatus = { ahead: 0, behind: 0, branch: null, detached: false, entries: [] };
  const records = stdout.split("\0");

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] as string;
    const kind = record[0];
    const xy = record.slice(2, 4);

    if (kind === "#") {
      applyHeader(status, record);
    } else if (kind === "1") {
      status.entries.push(entry(splitFields(record, TRACKED_FIELDS).pop() as string, xy, false, false));
    } else if (kind === "2") {
      status.entries.push(entry(splitFields(record, RENAME_FIELDS).pop() as string, xy, false, false));
      index += 1; // the original name follows as its own NUL-terminated field
    } else if (kind === "u") {
      status.entries.push(entry(splitFields(record, CONFLICT_FIELDS).pop() as string, xy, true, false));
    } else if (kind === "?") {
      status.entries.push(entry(record.slice(2), "??", false, true));
    }
  }

  return status;
}

function entry(path: string, xy: string, conflicted: boolean, untracked: boolean): StatusEntry {
  return { conflicted, index: untracked ? "." : (xy[0] ?? "."), path, untracked, worktree: untracked ? "." : (xy[1] ?? ".") };
}

export interface NumstatRow {
  added: number;
  path: string;
  removed: number;
}

/** `git diff --numstat -z`: `A\tR\tpath\0`, or `A\tR\t\0old\0new\0` for a rename. Binary rows count as 0. */
export function parseNumstat(stdout: string): NumstatRow[] {
  const tokens = stdout.split("\0");
  const rows: NumstatRow[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(tokens[index] as string);

    if (!match) {
      continue;
    }

    const renamed = match[3] === "";
    const path = renamed ? (tokens[index + 2] ?? "") : (match[3] as string);
    index += renamed ? 2 : 0;

    if (path) {
      rows.push({ added: match[1] === "-" ? 0 : Number(match[1]), path, removed: match[2] === "-" ? 0 : Number(match[2]) });
    }
  }

  return rows;
}

export interface BranchRow {
  checkedOut: boolean;
  current: boolean;
  name: string;
  remote: boolean;
  worktreePath: null | string;
}

/** `git branch --all --format=%(refname)%09%(HEAD)%09%(worktreepath)`. */
export function parseBranches(stdout: string): BranchRow[] {
  const rows: BranchRow[] = [];

  for (const line of stdout.split("\n")) {
    const [ref = "", head = "", worktreePath = ""] = line.split("\t");
    const local = ref.startsWith("refs/heads/");
    const remote = ref.startsWith("refs/remotes/");

    if ((!local && !remote) || ref.endsWith("/HEAD")) {
      continue;
    }

    rows.push({
      checkedOut: worktreePath !== "",
      current: head === "*",
      name: ref.replace(/^refs\/(?:heads|remotes)\//, ""),
      remote,
      worktreePath: worktreePath || null
    });
  }

  return rows;
}

export interface WorktreeRow {
  branch: null | string;
  detached: boolean;
  isMain: boolean;
  locked: boolean;
  path: string;
}

/** `git worktree list --porcelain`: blank-line separated blocks, the first is the main checkout. */
export function parseWorktrees(stdout: string): WorktreeRow[] {
  return stdout
    .split(/\n\n+/)
    .filter(block => block.startsWith("worktree "))
    .map((block, position) => {
      const lines = block.split("\n");
      const find = (key: string) => lines.find(line => line === key || line.startsWith(`${key} `));
      const branch = find("branch")?.slice("branch ".length) ?? null;

      return {
        branch: branch ? branch.replace(/^refs\/heads\//, "") : null,
        detached: lines.includes("detached"),
        isMain: position === 0,
        locked: Boolean(find("locked")),
        path: (lines[0] as string).slice("worktree ".length)
      };
    });
}

/** `Added` lines for a file git does not know yet, in unified-diff form. */
export function allAddedDiff(relativePath: string, text: string): string {
  const lines = text.length === 0 ? [] : text.replace(/\n$/, "").split("\n");
  const header = [
    `diff --git a/${relativePath} b/${relativePath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${relativePath}`
  ];

  return lines.length === 0
    ? `${header.join("\n")}\n`
    : `${[...header, `@@ -0,0 +1,${lines.length} @@`, ...lines.map(line => `+${line}`)].join("\n")}\n${text.endsWith("\n") ? "" : "\\ No newline at end of file\n"}`;
}

export function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  const newlines = text.split("\n").length - 1;

  return text.endsWith("\n") ? newlines : newlines + 1;
}
