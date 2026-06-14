#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../roadmap.json', import.meta.url);
const roadmap = JSON.parse(readFileSync(file, 'utf8'));

function codexFor(item) {
  if (item.model === 'opus' || item.effort === 'high' || item.size === 'XL') return 'gpt-5.5';
  if (item.model === 'haiku' || item.effort === 'low' || item.size === 'S') return 'gpt-5.4-mini';
  return 'gpt-5.4';
}

let changed = 0;
for (const item of roadmap.items) {
  const next = codexFor(item);
  if (item.codex !== next) {
    item.codex = next;
    changed += 1;
  }
}

writeFileSync(file, `${JSON.stringify(roadmap, null, 2)}\n`);
console.log(`tagged ${changed} roadmap items with codex routing`);
