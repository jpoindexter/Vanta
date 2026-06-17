import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SrcFile } from "./boundaries.js";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "__fixtures__"]);

/** Recursively collect every .ts/.tsx source file under a root. */
export function collectSrcFiles(root: string): SrcFile[] {
  const out: SrcFile[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) out.push({ path: full.slice(root.length + 1), src: readFileSync(full, "utf8") });
    }
  };
  walk(root);
  return out;
}
