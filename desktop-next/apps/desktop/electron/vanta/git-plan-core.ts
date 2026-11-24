/** The commands to run, and what the caller gets back once they have all succeeded. */
export type Plan = { commands: string[]; ok: true; result?: unknown } | { message: string; ok: false };

export const refuse = (message: string): Plan => ({ message, ok: false });

/** POSIX single-quote escaping, so a file name or message is one literal argument and never shell syntax. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export interface Target {
  /** `git` or `git -C <folder>` when the repository is a folder inside the project. */
  git: string;
  cwd: string;
}

