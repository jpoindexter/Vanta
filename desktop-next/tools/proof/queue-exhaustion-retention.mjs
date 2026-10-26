// A rejected background handoff must stop retrying, not erase the request.
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
const checks = [], errors = [], key = 'absent-exhaustion-chat';
const entries = [
  { id: 'exhausted-first', text: 'Keep this rejected request exactly.', attachments: [], queuedAt: 1 },
  { id: 'unattempted-second', text: 'Do not skip ahead to this request.', attachments: [], queuedAt: 2 }
];
let current, failure;
async function open() {
  current = await launchApp({ box, project: box.projectA, modelUrl: model.url });
  errors.push(current.errors);
  await waitForShell(current.page);
  const later = current.page.getByRole('button', { name: /choose a provider later/i });
  if (await later.isVisible().catch(() => false)) await later.click();
  await current.page.getByText('ready', { exact: true }).first().waitFor();
}
const readQueue = () => current.page.evaluate(key => JSON.parse(localStorage.getItem('vanta.desktop.composerQueue.v1') || '{}')[key] || [], key);
try {
  await open();
  await current.page.evaluate(({ key, entries }) => {
    const storageKey = 'vanta.desktop.composerQueue.v1';
    localStorage.setItem(storageKey, JSON.stringify({ [key]: entries }));
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: localStorage.getItem(storageKey) }));
  }, { key, entries });
  await current.page.waitForFunction(key => {
    const queue = JSON.parse(localStorage.getItem('vanta.desktop.composerQueue.v1') || '{}')[key] || [];
    return !queue.some(entry => entry.id === 'exhausted-first') || queue[0]?.drainFailures >= 4;
  }, key, { timeout: 30_000 });
  const exhausted = await readQueue();
  assert.deepEqual(exhausted.map(({ drainFailures, ...payload }) => payload), entries);
  assert.equal(exhausted[0].drainFailures, 4);
  assert.equal(exhausted[1].drainFailures, undefined);
  checks.push('four rejected background handoffs retain both exact queued requests without skipping ahead');
  await current.page.waitForTimeout(2_000);
  assert.deepEqual(await readQueue(), exhausted);
  checks.push('exhaustion stops automatic retries rather than discarding queued work');
  await current.app.close(); killLeftovers(box);
  await open();
  await current.page.waitForTimeout(3_000);
  assert.deepEqual(await readQueue(), exhausted);
  assert.equal(model.requests.length, 0);
  assert.deepEqual(errors.flat(), []);
  checks.push('cold restart retains the spent retry budget and exact requests with no model call or renderer error');
} catch (error) { failure = String(error.stack ?? error); }
finally {
  await current?.app.close().catch(() => {});
  await model.close(); killLeftovers(box);
  const result = { pass: !failure, checks, failure, source: root, sandbox: box.root,
    rendererErrors: errors.flat(), modelRequests: model.requests.length };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (failure) process.exitCode = 1;
}
