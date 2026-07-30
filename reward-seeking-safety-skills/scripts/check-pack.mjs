#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const VANTA_LENSES = new Set([
  "agent-loop",
  "tui",
  "memory",
  "reach",
  "selfhood",
  "coding",
  "infra",
  "cosmetic",
]);
const VANTA_STATUSES = new Set(["shipped", "building", "blocked", "next", "horizon", "parked"]);
const VANTA_TIERS = new Set(["rock", "pebble", "sand"]);
const VANTA_MODELS = new Set(["haiku", "sonnet", "opus"]);
const VANTA_EFFORTS = new Set(["low", "medium", "high"]);
const VANTA_CODEX_MODELS = new Set([
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex-spark",
]);
const VANTA_PARKED_REASONS = new Set([
  "external proof",
  "strategy decision",
  "declined/n-a",
  "duplicate",
  "optional proof",
  "review",
]);

async function listDirectories(path) {
  return (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function validateFrontmatter(source, name) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${name}: missing YAML frontmatter`);
  if (!new RegExp(`^name: ${name}$`, "m").test(match[1])) {
    throw new Error(`${name}: frontmatter name mismatch`);
  }
  const description = match[1].match(/^description: (.+)$/m)?.[1] ?? "";
  if (description.length < 80) throw new Error(`${name}: description is too vague`);
}

async function validateSkill(name) {
  const path = join(ROOT, "skills", name, "SKILL.md");
  const source = await readFile(path, "utf8");
  validateFrontmatter(source, name);
  if (source.split("\n").length > 500) throw new Error(`${name}: SKILL.md exceeds 500 lines`);
  const agent = await readFile(join(ROOT, "skills", name, "agents", "openai.yaml"), "utf8");
  if (!agent.includes("display_name:") || !agent.includes("short_description:")) {
    throw new Error(`${name}: incomplete agents/openai.yaml`);
  }
}

async function main() {
  const names = await listDirectories(join(ROOT, "skills"));
  await Promise.all(names.map(validateSkill));
  const payload = JSON.parse(await readFile(join(ROOT, "roadmap", "vanta-cards.json"), "utf8"));
  const ids = payload.cards.map((card) => card.id);
  if (new Set(ids).size !== ids.length) throw new Error("roadmap payload contains duplicate IDs");
  for (const card of payload.cards) {
    if (!VANTA_STATUSES.has(card.status)) throw new Error(`${card.id}: invalid status ${card.status}`);
    if (!VANTA_TIERS.has(card.tier)) throw new Error(`${card.id}: invalid tier ${card.tier}`);
    if (!VANTA_MODELS.has(card.model)) throw new Error(`${card.id}: invalid model ${card.model}`);
    if (!VANTA_EFFORTS.has(card.effort)) throw new Error(`${card.id}: invalid effort ${card.effort}`);
    if (!VANTA_CODEX_MODELS.has(card.codex)) throw new Error(`${card.id}: invalid Codex model ${card.codex}`);
    if (!VANTA_LENSES.has(card.lens)) {
      throw new Error(`${card.id}: invalid Vanta lens ${card.lens}`);
    }
    if (card.status === "parked" && !VANTA_PARKED_REASONS.has(card.parkedReason)) {
      throw new Error(`${card.id}: parked cards require a valid parkedReason`);
    }
    if (card.status !== "parked" && card.parkedReason) {
      throw new Error(`${card.id}: parkedReason is only valid for parked cards`);
    }
  }
  const topics = (await readFile(join(ROOT, "repository-topics.txt"), "utf8"))
    .trim().split("\n");
  if (topics.length > 20) throw new Error("GitHub supports at most 20 repository topics");
  process.stdout.write(`Validated ${names.length} skills and ${ids.length} roadmap cards.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
