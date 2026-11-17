// Regenerate only ROADMAP.md's current section; preserve historical narrative.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openItems } from './build-order.mjs';

export function projectCurrentRoadmap(roadmap, document) {
  const start = document.indexOf('## Current converged build order');
  const end = document.indexOf('## Historical narrative below');
  if (start < 0 || end <= start) throw new Error('Missing current/history boundaries');
  const ordered = openItems(roadmap);
  const counts = roadmap.items.reduce((out, card) => {
    out[card.status] = (out[card.status] || 0) + 1;
    return out;
  }, {});
  const lines = [`## Current converged build order — ${roadmap.updated}`, '',
    'Generated from `roadmap.json` by `node scripts/roadmap-current-projection.mjs`. Do not hand-edit this section.', ''];
  for (const [status, label] of [['building', 'Building'], ['next', 'Next'], ['horizon', 'Horizon'], ['blocked', 'Blocked']]) {
    const cards = ordered.filter(card => card.status === status);
    lines.push(`**${label}**`, '');
    if (!cards.length) lines.push(`No cards currently ${label}.`, '');
    else lines.push(...cards.map((card, index) => `${index + 1}. \`${card.id}\` — ${card.title}`), '');
  }
  lines.push(`Inventory: ${roadmap.items.length} cards; ${counts.shipped || 0} shipped; ${ordered.length} open; ${counts.parked || 0} parked.`, '',
    'Next means planned, not implemented. Preserve shipped evidence; card completion requires its executed Done contract.', '',
    'Desktop direction and phase gates: [whole ambient workflow](docs/desktop-ambient-workflow-2026-10-02.md). Earlier decisions remain in the [September plan](docs/desktop-chat-first-revamp-plan-2026-09-08.md).', '',
    'The unfamiliar-person proof and GROW-01 remain deferred. No paid services, publication, or new runtime authority are implied.', '',
    'Prior research and reconciliation records remain in the dated audit documents and canonical card notes.', '');
  return document.slice(0, start) + lines.join('\n') + '\n' + document.slice(end);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const path = resolve(root, 'ROADMAP.md');
  const original = readFileSync(path, 'utf8');
  const projected = projectCurrentRoadmap(JSON.parse(readFileSync(resolve(root, 'roadmap.json'), 'utf8')), original);
  if (process.argv.includes('--check')) {
    if (original !== projected) throw new Error('ROADMAP.md projection is stale');
    console.log('ROADMAP.md projection matches canonical JSON');
  } else {
    writeFileSync(path, projected);
    console.log('ROADMAP.md current section regenerated; history preserved');
  }
}
