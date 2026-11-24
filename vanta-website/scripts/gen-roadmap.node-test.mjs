import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('public in-flight headings omit internal provenance without hiding the card', () => {
  const root = mkdtempSync(join(tmpdir(), 'vanta-roadmap-heading-'));
  try {
    for (const path of ['vanta-website/scripts', 'vanta-website/docs', 'scripts']) mkdirSync(join(root, path), { recursive: true });
    copyFileSync(new URL('./gen-roadmap.mjs', import.meta.url), join(root, 'vanta-website/scripts/gen-roadmap.mjs'));
    copyFileSync(new URL('../../scripts/build-order.mjs', import.meta.url), join(root, 'scripts/build-order.mjs'));
    writeFileSync(join(root, 'roadmap.json'), JSON.stringify({ updated: '2026-10-25', items: [{
      id: 'DESKTOP', title: 'Desktop Next — supervision surface for the company engine, Hermes shell as base',
      track: 'Operator', size: 'L', status: 'building', after: [], summary: 'Make the desktop usable.'
    }] }));
    const result = spawnSync(process.execPath, [join(root, 'vanta-website/scripts/gen-roadmap.mjs')], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const output = readFileSync(join(root, 'vanta-website/docs/roadmap.md'), 'utf8');
    assert.match(output, /^### Desktop Next$/m);
    assert.doesNotMatch(output, /^### .*Hermes|^### .*company engine/m);
    assert.match(output, /1 in flight/);
    const roadmap = JSON.parse(readFileSync(join(root, 'roadmap.json'), 'utf8'));
    roadmap.items[0].title = 'Hermes internal runtime';
    writeFileSync(join(root, 'roadmap.json'), JSON.stringify(roadmap));
    const rejected = spawnSync(process.execPath, [join(root, 'vanta-website/scripts/gen-roadmap.mjs')], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /unsafe public heading/);
    assert.equal(readFileSync(join(root, 'vanta-website/docs/roadmap.md'), 'utf8'), output);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
