import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const MAX_DESKTOP_ATTACHMENTS = 50;

const SKIPPED_DIRECTORIES = new Set([
  ".aws",
  ".git",
  ".gnupg",
  ".ssh",
  ".vanta",
  "node_modules",
  "target",
]);
const SKIPPED_FILES = [
  /^\.env(?:\.|$)/i,
  /^\.(?:netrc|npmrc|pypirc)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /(?:^|[-_.])(credential|credentials|secret|secrets)(?:[-_.]|$)/i,
  /\.(?:key|p12|pem|pfx)$/i,
];

export async function resolveDroppedPaths(paths, projectRoot, maximum = MAX_DESKTOP_ATTACHMENTS) {
  const root = resolve(projectRoot);
  const files = [];
  const items = [];
  const errors = [];
  const seen = new Set();
  let skipped = 0;
  let truncated = false;

  function displayPath(absolutePath) {
    const projectPath = relative(root, absolutePath);
    return !projectPath.startsWith(`..${sep}`) && !isAbsolute(projectPath)
      ? projectPath.split(sep).join("/")
      : absolutePath;
  }

  async function visit(rawPath, itemFiles) {
    if (files.length >= maximum) {
      truncated = true;
      return;
    }
    const absolutePath = resolve(rawPath);
    if (seen.has(absolutePath)) return;
    seen.add(absolutePath);

    let entry;
    try {
      entry = await lstat(absolutePath);
    } catch {
      errors.push(`Could not attach ${rawPath}: the item is unavailable.`);
      return;
    }
    if (entry.isSymbolicLink()) {
      skipped += 1;
      return;
    }
    const name = absolutePath.split(sep).at(-1) ?? "";
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(name)) {
        skipped += 1;
        return;
      }
      let children;
      try {
        children = await readdir(absolutePath);
      } catch {
        errors.push(`Could not attach ${rawPath}: the folder is not readable.`);
        return;
      }
      for (const child of children.sort((a, b) => a.localeCompare(b))) {
        await visit(resolve(absolutePath, child), itemFiles);
        if (files.length >= maximum) truncated = true;
      }
      return;
    }
    if (!entry.isFile() || SKIPPED_FILES.some((pattern) => pattern.test(name))) {
      skipped += 1;
      return;
    }
    const file = displayPath(absolutePath);
    files.push(file);
    itemFiles.push(file);
  }

  for (const path of Array.isArray(paths) ? paths.slice(0, 100) : []) {
    if (typeof path !== "string" || !path.trim()) continue;
    const absolutePath = resolve(path);
    let topLevel;
    try {
      topLevel = await lstat(absolutePath);
    } catch {
      errors.push(`Could not attach ${path}: the item is unavailable.`);
      continue;
    }
    const itemFiles = [];
    await visit(path, itemFiles);
    if (!itemFiles.length) continue;
    const kind = topLevel.isDirectory() ? "folder" : "file";
    const itemPath = displayPath(absolutePath);
    items.push({
      id: `${kind}:${itemPath}`,
      kind,
      path: itemPath,
      label: absolutePath.split(sep).at(-1) ?? itemPath,
      files: itemFiles,
    });
  }
  if (skipped) errors.push(`${skipped} unsafe, private, or unsupported item${skipped === 1 ? " was" : "s were"} skipped.`);
  if (truncated) errors.push(`Only the first ${maximum} files were attached.`);
  return { files, items, errors };
}
