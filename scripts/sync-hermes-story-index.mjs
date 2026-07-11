#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const hermesRoot = join(root, "reference", "hermes-agent");
const sourcePath = join(hermesRoot, "website", "src", "data", "userStories.json");
const outputPath = join(root, "eval", "use-cases", "hermes-story-index.json");

const CATEGORY_LABELS = {
  "business-ops": "Business Ops",
  "content-creation": "Content Creation",
  "cost-optimization": "Cost Optimization",
  creative: "Creative",
  "dev-workflow": "Dev Workflow",
  enterprise: "Enterprise",
  general: "General",
  integrations: "Integrations",
  marketing: "Marketing",
  messaging: "Messaging",
  meta: "Meta & Ecosystem",
  "personal-assistant": "Personal Assistant",
  privacy: "Privacy & Self-Hosted",
  research: "Research",
  trading: "Trading & Markets",
};

const source = JSON.parse(await readFile(sourcePath, "utf8"));
if (!Array.isArray(source) || source.length !== 262) {
  throw new Error(`expected 262 Hermes stories, found ${Array.isArray(source) ? source.length : "non-array"}`);
}

const ids = new Set();
const stories = source.map((story) => {
  if (typeof story.id !== "string" || ids.has(story.id)) throw new Error(`missing or duplicate story id: ${story.id}`);
  ids.add(story.id);
  const category = CATEGORY_LABELS[story.category];
  if (!category) throw new Error(`unmapped category: ${story.category}`);
  return {
    id: story.id,
    category,
    categorySlug: story.category,
    headline: story.headline,
    source: story.source,
    url: story.url,
    date: story.date ?? null,
  };
});

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: hermesRoot, encoding: "utf8" }).trim();
const output = {
  version: 1,
  generated: new Date().toISOString().slice(0, 10),
  sourceRepository: "https://github.com/NousResearch/hermes-agent",
  sourceCommit,
  sourcePath: "website/src/data/userStories.json",
  contentPolicy: "Index metadata only. Third-party quote bodies are intentionally excluded.",
  stories,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`sync-hermes-story-index: wrote ${stories.length} stories from ${sourceCommit.slice(0, 10)} to ${outputPath}`);
