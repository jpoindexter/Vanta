import { extname } from "node:path";
import { readFile } from "node:fs/promises";
import { resolveInScope } from "../scope.js";
import type { SessionWorkingMemory } from "../memory/working.js";
import { listSkills } from "../skills/store.js";
import { serializeSkill } from "../skills/frontmatter.js";
import type { Message } from "../types.js";

const FILE_LIMIT = 5;
const FILE_BYTES = 5 * 1024;
const FILE_TOTAL_BYTES = 50 * 1024;
const SKILL_TOTAL_BYTES = 25 * 1024;
const WRITE_TOOLS = new Set(["write_file", "edit_file"]);

type WorkingSet = Pick<SessionWorkingMemory, "recordEditedFile" | "getEditedFiles">;

export type PostCompactRestoreContext = {
  root: string;
  workingMemory?: WorkingSet;
  env?: NodeJS.ProcessEnv;
};

type Block = { title: string; lang: string; content: string };

export function recordCompactedEdits(workingMemory: WorkingSet | undefined, messages: Message[]): void {
  if (!workingMemory) return;
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const tc of m.toolCalls ?? []) {
      if (WRITE_TOOLS.has(tc.name) && typeof tc.arguments.path === "string") {
        workingMemory.recordEditedFile(tc.arguments.path);
      }
    }
  }
}

export async function runPostCompactRestore(ctx: PostCompactRestoreContext): Promise<string> {
  const [files, skills] = await Promise.all([readEditedFiles(ctx), readActiveSkills(ctx.env)]);
  if (!files.length && !skills.length) return "";
  const parts = ["<!-- vanta-post-compact-restore -->", "# Post-Compact Restore"];
  if (files.length) parts.push("## Recently Edited Files", ...formatBlocks(files));
  if (skills.length) parts.push("## Active Skills", ...formatBlocks(skills));
  parts.push("<!-- /vanta-post-compact-restore -->");
  return parts.join("\n");
}

async function readEditedFiles(ctx: PostCompactRestoreContext): Promise<Block[]> {
  const paths = ctx.workingMemory?.getEditedFiles(FILE_LIMIT) ?? [];
  const out: Block[] = [];
  let remaining = FILE_TOTAL_BYTES;
  for (const path of paths) {
    if (remaining <= 0) break;
    const block = await readOneFile(ctx.root, path, Math.min(FILE_BYTES, remaining));
    if (block) {
      remaining -= Buffer.byteLength(block.content);
      out.push(block);
    }
  }
  return out;
}

async function readOneFile(root: string, path: string, maxBytes: number): Promise<Block | null> {
  const resolved = resolveInScope(path, root);
  if (!resolved.ok) return null;
  try {
    const raw = await readFile(resolved.path, "utf8");
    return { title: path, lang: langFor(path), content: trimBytes(raw, maxBytes) };
  } catch {
    return null;
  }
}

async function readActiveSkills(env: NodeJS.ProcessEnv = process.env): Promise<Block[]> {
  let remaining = SKILL_TOTAL_BYTES;
  const out: Block[] = [];
  for (const skill of await listSkills(env).catch(() => [])) {
    if (remaining <= 0) break;
    const content = trimBytes(serializeSkill(skill), remaining, `[skills trimmed to ${SKILL_TOTAL_BYTES} bytes`);
    remaining -= Buffer.byteLength(content);
    out.push({ title: skill.meta.name, lang: "markdown", content });
  }
  return out;
}

function trimBytes(text: string, maxBytes: number, marker = `[trimmed to ${FILE_BYTES} bytes`): string {
  if (Buffer.byteLength(text) <= maxBytes) return text;
  const suffix = `\n${marker} from original]`;
  const bodyBytes = Math.max(0, maxBytes - Buffer.byteLength(suffix));
  const slice = Buffer.from(text).subarray(0, bodyBytes).toString("utf8");
  return `${slice}${suffix}`;
}

function formatBlocks(blocks: Block[]): string[] {
  return blocks.map((b) => `### ${b.title}\n\`\`\`${b.lang}\n${escapeFence(b.content).trimEnd()}\n\`\`\``);
}

function escapeFence(text: string): string {
  return text.replaceAll("```", "`\u200b``");
}

function langFor(path: string): string {
  const ext = extname(path).slice(1);
  if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "json" || ext === "md") return ext;
  return "";
}
