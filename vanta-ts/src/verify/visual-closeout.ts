import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CloseoutKind = "rules" | "visual" | "behavior" | "docs";

export type CloseoutPlan = {
  files: string[];
  kinds: CloseoutKind[];
  hasUi: boolean;
  hasRuntimeCode: boolean;
};

const UI_EXT_RE = /\.(css|scss|sass|less|html|jsx|tsx|vue|svelte)$/i;
const UI_PATH_RE = /(^|\/)(app|components|desktop-app|pages|public|renderer|src\/term|src\/ui|styles?)\//;
const DOC_RE = /(^|\/)(AGENTS|CLAUDE|HANDOFF|README|ROADMAP)\.md$|\.mdx?$/i;
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/i;
const CODE_RE = /\.(cjs|cts|js|jsx|mjs|mts|rs|ts|tsx)$/i;

function uniqSorted(lines: string[]): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))].sort();
}

async function gitLines(root: string, args: string[]): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: root });
    return stdout.split("\n");
  } catch {
    return [];
  }
}

export function isUiFile(path: string): boolean {
  return !TEST_RE.test(path) && (UI_EXT_RE.test(path) || UI_PATH_RE.test(path));
}

export function isDocFile(path: string): boolean {
  return DOC_RE.test(path);
}

export function isRuntimeCodeFile(path: string): boolean {
  return CODE_RE.test(path) && !TEST_RE.test(path) && !isDocFile(path);
}

export function buildCloseoutPlan(files: string[]): CloseoutPlan {
  const changed = uniqSorted(files);
  const hasUi = changed.some(isUiFile);
  const hasRuntimeCode = changed.some(isRuntimeCodeFile);
  const hasNonDoc = changed.some((file) => !isDocFile(file));
  const kinds: CloseoutKind[] = [];

  if (hasNonDoc || changed.length === 0) kinds.push("rules");
  if (hasUi) kinds.push("visual");
  if (hasRuntimeCode) kinds.push("behavior");
  if (changed.length > 0 && !hasNonDoc) kinds.push("docs");

  return { files: changed, kinds, hasUi, hasRuntimeCode };
}

export async function readChangedFiles(root: string): Promise<string[]> {
  const [tracked, untracked] = await Promise.all([
    gitLines(root, ["diff", "--name-only", "HEAD", "--"]),
    gitLines(root, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  return uniqSorted([...tracked, ...untracked]);
}

function requirement(kind: CloseoutKind): string {
  if (kind === "rules") {
    return "rules: run the narrowest relevant test/type/lint command and cite the exact output.";
  }
  if (kind === "visual") {
    return "visual: start the relevant app/view, capture a browser screenshot, and cite the screenshot path plus what changed on screen.";
  }
  if (kind === "behavior") {
    return "behavior: exercise the changed runtime path with a representative command/tool call and cite the observed output.";
  }
  return "docs: re-read the rendered or changed doc text and cite the lines or diff that prove the update.";
}

export function formatCloseoutPrompt(plan: CloseoutPlan): string {
  const files = plan.files.length ? plan.files.slice(0, 16).map((file) => `- ${file}`) : ["- (no changed files detected)"];
  const hidden = plan.files.length > 16 ? [`- ...${plan.files.length - 16} more file(s)`] : [];
  const requirements = plan.kinds.map((kind) => `- ${requirement(kind)}`);
  return [
    "Verification close-out requirements:",
    "Changed files:",
    ...files,
    ...hidden,
    "Required evidence:",
    ...requirements,
    "Close-out rule: report what command or screenshot you used, what you observed, and what that evidence does not prove. If evidence is blocked, say why instead of claiming success.",
  ].join("\n");
}

export async function buildVerificationCloseoutPrompt(root: string): Promise<string> {
  return formatCloseoutPrompt(buildCloseoutPlan(await readChangedFiles(root)));
}
