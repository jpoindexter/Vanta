import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createProjectGuard, type ProjectGuard } from "./project-guard";

export interface Sandbox {
  cleanup: () => void;
  guard: ProjectGuard;
  /** A folder next to the project that the guard must never let anything reach. */
  outside: string;
  root: string;
}

/** A project folder plus an `outside` sibling, both under a fresh temp dir. Paths are realpaths. */
export function makeSandbox(deniedRoots: string[] = []): Sandbox {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), "vanta-caps-")));
  const root = path.join(base, "project");
  const outside = path.join(base, "outside");
  mkdirSync(root);
  mkdirSync(outside);
  writeFileSync(path.join(outside, "secret.txt"), "outside-data\n");

  return {
    cleanup: () => rmSync(base, { force: true, recursive: true }),
    guard: createProjectGuard({ deniedRoots: () => deniedRoots, root: () => root }),
    outside,
    root
  };
}

export const write = (file: string, text: string): string => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);

  return file;
};

export const link = (target: string, at: string): void => symlinkSync(target, at);

const GIT_ENV = {
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_AUTHOR_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  HOME: "/nonexistent",
  PATH: process.env.PATH ?? "/usr/bin:/bin"
};

/** Test-only setup git. Production code never builds argv like this: it goes through the allow-listed runner. */
export const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", env: GIT_ENV });

export function initRepo(root: string): void {
  git(root, "init", "-q", "-b", "main");
  write(path.join(root, "a.txt"), "one\ntwo\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "first");
}
