import { statSync } from "node:fs";
import { basename, resolve, sep } from "node:path";

const STANDING_INSTRUCTION_FILES = new Set([
  "agents.md", "claude.md", "vanta.md", "skill.md", "soul.md", "program.md", "memory.md",
]);

/** Named instruction inputs, not arbitrary prose or ordinary runtime source. */
export function instructionPathReason(abs: string): string | null {
  const path = resolve(abs).split(sep).join("/").toLowerCase();
  if (STANDING_INSTRUCTION_FILES.has(basename(path))) return "standing instruction file";
  if (/\/\.(?:claude|agents|vanta)\/(?:agents|skills)\/.*\.(?:md|json|ya?ml)$/.test(path)) {
    return "agent or skill instruction definition";
  }
  if (/\/\.claude\/settings(?:\.local)?\.json$/.test(path)) return "agent hook or execution policy";
  // A hard-linked ordinary name can mutate a standing-order inode under another
  // name. Conservatively require exact approval without reading private bodies
  // or claiming the inode's other names have been exhaustively enumerated.
  try {
    const stat = statSync(abs);
    if (stat.isFile() && stat.nlink > 1) return "hard-linked file with unresolved instruction aliases";
  } catch { /* Missing files are classified by their name before creation. */ }
  return null;
}
