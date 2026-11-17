// Current v3 text/local queue storage: an empty backend cannot discard unsent work.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.VANTA_PROOF_SOURCE;
assert.ok(root, 'An explicit source checkout is required');
const from = file => import(pathToFileURL(path.join(root, 'desktop-next/tools', file)));
const { makeSandbox, launchApp, killLeftovers } = await from('done-path/harness.mjs');
const { waitForShell } = await from('done-path/lib.mjs');
const { startScriptedModel } = await from('done-path/scripted-model.mjs');
const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: true });
const box = await makeSandbox(), model = await startScriptedModel();
const checks = [], errors = [];
const drafts = { 'absent-text-draft': 'Keep these exact unsent words after empty startup.' };
const queues = { 'absent-queue-chat': [{ id: 'retained-queue-fixture', text: 'Keep this queued request.', attachments: [], queuedAt: 1 }] };
let current, failure;
async function open() {
  current = await launchApp({ box, project: box.projectA, modelUrl: model.url });
  errors.push(current.errors);
  current.page.setDefaultTimeout(20_000);
  await waitForShell(current.page);
  const later = current.page.getByRole('button', { name: /choose a provider later/i });
  if (await later.isVisible().catch(() => false)) await later.click();
  await current.page.getByText('ready', { exact: true }).first().waitFor();
}
function sessionFiles() {
  const dir = path.join(box.vantaHome, 'sessions');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(file => file.endsWith('.json')) : [];
}
try {
  await open();
  assert.deepEqual(sessionFiles(), []);
  await current.page.evaluate(({ drafts, queues }) => {
    for (const [key, value] of [['desktop:composer-drafts:v3', drafts], ['vanta.desktop.composerQueue.v1', queues]]) {
      localStorage.setItem(key, JSON.stringify(value));
      // Queue bytes represent an already-saved cold-start fixture, not a new live queue request.
      if (key === 'desktop:composer-drafts:v3') window.dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key) }));
    }
    localStorage.setItem('vanta.desktop.pinnedSessions', JSON.stringify(['absent-text-draft', 'absent-queue-chat']));
  }, { drafts, queues });
  await current.app.close(); killLeftovers(box);
  await open();
  await current.page.waitForFunction(() => {
    const pins = JSON.parse(localStorage.getItem('vanta.desktop.pinnedSessions') || '[]');
    return !pins.includes('absent-text-draft') && !pins.includes('absent-queue-chat');
  });
  checks.push('a real empty-history launch removes only confirmed stale pin references');
  await current.page.waitForTimeout(3_000);
  const stored = await current.page.evaluate(() => ({
    drafts: JSON.parse(localStorage.getItem('desktop:composer-drafts:v3') || '{}'),
    queues: JSON.parse(localStorage.getItem('vanta.desktop.composerQueue.v1') || '{}')
  }));
  assert.equal(stored.drafts['absent-text-draft'], drafts['absent-text-draft']);
  assert.deepEqual(stored.queues['absent-queue-chat'], queues['absent-queue-chat']);
  checks.push('exact unsent text and queued request ID/content survive cleanup and cold restart');
  assert.deepEqual(sessionFiles(), []);
  assert.equal(model.requests.length, 0);
  assert.deepEqual(errors.flat(), []);
  checks.push('the session store stays empty, with no model request or renderer error');
  await current.page.screenshot({ path: path.join(output, 'retained-work.png') });
} catch (error) {
  failure = String(error.stack ?? error);
  await current?.page.screenshot({ path: path.join(output, 'FAIL.png') }).catch(() => {});
} finally {
  await current?.app.close().catch(() => {});
  await model.close(); killLeftovers(box);
  const result = { pass: !failure, checks, failure, source: root, sandbox: box.root,
    rendererErrors: errors.flat(), modelRequests: model.requests.length };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (failure) process.exitCode = 1;
}
