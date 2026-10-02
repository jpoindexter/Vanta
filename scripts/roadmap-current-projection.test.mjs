import assert from 'node:assert/strict';
import test from 'node:test';
import { projectCurrentRoadmap } from './roadmap-current-projection.mjs';
const document = '# Roadmap\n\n## Current converged build order — old\nOld prose\n\n## Historical narrative below\nKeep this exact.\n';
const roadmap = { updated: '2026-09-08', items: [{ id: 'UI', title: 'Chat first', status: 'next', track: 'Operator' }] };
test('projects current canonical cards and preserves history exactly', () => {
  const output = projectCurrentRoadmap(roadmap, document);
  assert.match(output, /`UI` — Chat first/);
  assert.match(output, /1 cards; 0 shipped; 1 open; 0 parked/);
  assert.ok(output.endsWith('## Historical narrative below\nKeep this exact.\n'));
  assert.ok(output.startsWith('# Roadmap\n\n'));
});
test('projection is idempotent', () => {
  const output = projectCurrentRoadmap(roadmap, document);
  assert.equal(projectCurrentRoadmap(roadmap, output), output);
});
test('missing boundaries fail without replacing the document', () => {
  assert.throws(() => projectCurrentRoadmap(roadmap, '# Other'), /boundaries/);
});
