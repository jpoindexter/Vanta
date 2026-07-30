#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function requireCards(payload) {
  if (!payload || !Array.isArray(payload.cards) || payload.cards.length === 0) {
    throw new Error("payload.cards must be a non-empty array");
  }
  const ids = payload.cards.map((card) => card.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) throw new Error(`duplicate payload card id: ${duplicate}`);
  return payload.cards;
}

function validateTarget(target) {
  if (!target || !Array.isArray(target.items)) {
    throw new Error("target roadmap must contain an items array");
  }
  return target;
}

function backupPath(path) {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return `${path}.bak.${stamp}`;
}

export function mergeCards(target, cards) {
  const existing = new Set(target.items.map((item) => item.id));
  const conflicts = cards.filter((card) => existing.has(card.id)).map((card) => card.id);
  if (conflicts.length) throw new Error(`roadmap already contains: ${conflicts.join(", ")}`);
  return { ...target, items: [...target.items, ...cards] };
}

async function main() {
  const [payloadPath, roadmapPath] = process.argv.slice(2);
  if (!payloadPath || !roadmapPath) {
    throw new Error("usage: apply-vanta-roadmap.mjs <cards.json> <roadmap.json>");
  }
  const payload = JSON.parse(await readFile(payloadPath, "utf8"));
  const target = validateTarget(JSON.parse(await readFile(roadmapPath, "utf8")));
  const merged = mergeCards(target, requireCards(payload));
  const backup = backupPath(roadmapPath);
  await copyFile(roadmapPath, backup);
  await writeFile(roadmapPath, `${JSON.stringify(merged, null, 2)}\n`);
  process.stdout.write(`Added ${payload.cards.length} cards. Backup: ${backup}\n`);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
