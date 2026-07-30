#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);
const ROOT_INSTRUCTION_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
]);
const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILES = 500;

function normalizeLine(line) {
  return line
    .replace(/<!--.*?-->/g, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function estimateTokens(characters) {
  return Math.ceil(characters / 4);
}

function isInstructionFile(relativePath) {
  if (ROOT_INSTRUCTION_FILES.has(relativePath)) return true;
  if (relativePath.endsWith("/SKILL.md") || relativePath === "SKILL.md") return true;
  if (/^\.claude\/rules\/.+\.md$/u.test(relativePath)) return true;
  if (/^\.cursor\/rules\/.+\.(?:md|mdc)$/u.test(relativePath)) return true;
  return false;
}

function layerFor(relativePath) {
  if (ROOT_INSTRUCTION_FILES.has(relativePath)) return "always-on";
  if (relativePath.endsWith("/SKILL.md") || relativePath === "SKILL.md") {
    return "on-demand-skill";
  }
  if (
    relativePath.startsWith(".claude/rules/") ||
    relativePath.startsWith(".cursor/rules/")
  ) {
    return "rule-review";
  }
  return "unknown";
}

async function walk(root, current = root, found = []) {
  if (found.length >= MAX_FILES) return found;
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (found.length >= MAX_FILES) break;
    if (entry.isSymbolicLink()) continue;
    const absolutePath = resolve(current, entry.name);
    const relativePath = relative(root, absolutePath);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        await walk(root, absolutePath, found);
      }
      continue;
    }
    if (entry.isFile() && isInstructionFile(relativePath)) found.push(relativePath);
  }
  return found;
}

function collectDuplicates(files) {
  const occurrences = new Map();
  for (const file of files) {
    file.lines.forEach((line, index) => {
      const normalized = normalizeLine(line);
      if (normalized.length < 32) return;
      const item = { file: file.path, line: index + 1, text: line.trim() };
      occurrences.set(normalized, [...(occurrences.get(normalized) ?? []), item]);
    });
  }
  return [...occurrences.values()]
    .filter((items) => new Set(items.map((item) => item.file)).size > 1)
    .map((items) => ({ text: items[0].text, occurrences: items }));
}

export async function auditContext(inputRoot) {
  const root = resolve(inputRoot);
  const paths = (await walk(root)).sort();
  const files = [];
  const skipped = [];

  for (const path of paths) {
    const absolutePath = resolve(root, path);
    const metadata = await stat(absolutePath);
    if (metadata.size > MAX_FILE_BYTES) {
      skipped.push({ path, reason: `larger than ${MAX_FILE_BYTES} bytes` });
      continue;
    }
    const source = await readFile(absolutePath, "utf8");
    const lines = source.split(/\r?\n/u);
    files.push({
      path,
      layer: layerFor(path),
      bytes: metadata.size,
      lines,
      lineCount: lines.length,
      estimatedTokens: estimateTokens(source.length),
    });
  }

  const alwaysOn = files.filter((file) => file.layer === "always-on");
  return {
    schemaVersion: 1,
    root,
    scannedAt: new Date().toISOString(),
    totals: {
      sources: files.length,
      alwaysOnSources: alwaysOn.length,
      alwaysOnLines: alwaysOn.reduce((sum, file) => sum + file.lineCount, 0),
      alwaysOnEstimatedTokens: alwaysOn.reduce(
        (sum, file) => sum + file.estimatedTokens,
        0,
      ),
    },
    sources: files.map(({ lines, ...file }) => file),
    duplicates: collectDuplicates(files),
    skipped,
    limits: { maxFiles: MAX_FILES, maxFileBytes: MAX_FILE_BYTES },
  };
}

export function renderMarkdown(report) {
  const lines = [
    "# Context doctor inventory",
    "",
    `- Root: \`${report.root}\``,
    `- Always-on estimate: ${report.totals.alwaysOnEstimatedTokens} tokens across ${report.totals.alwaysOnSources} sources`,
    `- Discovered instruction sources: ${report.totals.sources}`,
    `- Exact cross-file duplicates: ${report.duplicates.length}`,
    "",
    "## Sources",
    "",
    "| Layer | File | Lines | Estimated tokens |",
    "| --- | --- | ---: | ---: |",
    ...report.sources.map(
      (source) =>
        `| ${source.layer} | \`${source.path}\` | ${source.lineCount} | ${source.estimatedTokens} |`,
    ),
  ];

  if (report.duplicates.length) {
    lines.push("", "## Exact duplicate candidates", "");
    for (const duplicate of report.duplicates) {
      const locations = duplicate.occurrences
        .map((item) => `\`${item.file}:${item.line}\``)
        .join(" ↔ ");
      lines.push(`- ${locations}`);
    }
  }

  if (report.skipped.length) {
    lines.push("", "## Uninspected", "");
    for (const item of report.skipped) lines.push(`- \`${item.path}\`: ${item.reason}`);
  }

  lines.push(
    "",
    "> This inventory measures files and exact repeated lines. Semantic conflicts, obsolete guidance, and safe deletion require a reviewed audit.",
    "",
  );
  return lines.join("\n");
}

async function main(argv) {
  const json = argv.includes("--json");
  const root = argv.find((argument) => argument !== "--json") ?? ".";
  const report = await auditContext(root);
  process.stdout.write(
    json ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report),
  );
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
