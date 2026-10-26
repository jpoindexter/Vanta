// Private source Electron proof: missing backend rows must not erase unsent words.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.VANTA_PROOF_SOURCE;
assert.ok(root, 'An isolated source snapshot is required');
const from = file => import(pathToFileURL(path.join(root, 'desktop-next/tools', file)));
const { makeSandbox, launchApp, killLeftovers } = await from('done-path/harness.mjs');
const { waitForShell } = await from('done-path/lib.mjs');
const { startScriptedModel } = await from('done-path/scripted-model.mjs');
const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: true });
const box = await makeSandbox(), model = await startScriptedModel();
const checks = [], errors = [];
const owned = '__owned_draft_text_v1__:' + JSON.stringify(['local', 'default', 'absent-owned-draft']);
const fixtures = { [owned]: { text: 'Unsent owned words survive backend cleanup.', revision: '11111111-1111-1111-1111-111111111111' },
  'absent-legacy-draft': { text: 'Unassigned legacy words stay unassigned.', revision: '22222222-2222-2222-2222-222222222222' } };
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
try {
  await open();
  assert.equal(model.requests.length, 0);
  const sessionFiles = () => {
    const dir = path.join(box.vantaHome, 'sessions');
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter(file => file.endsWith('.json')) : [];
  };
  assert.deepEqual(sessionFiles(), []);
  await current.page.evaluate(drafts => {
    localStorage.setItem('desktop:composer-drafts:v4', JSON.stringify({ version: 4, drafts }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'desktop:composer-drafts:v4' }));
    localStorage.setItem('vanta.desktop.pinnedSessions', JSON.stringify(['absent-owned-draft', 'absent-legacy-draft']));
  }, fixtures);
  await current.app.close(); killLeftovers(box);
  await open();
  await current.page.waitForFunction(() => {
    const pins = JSON.parse(localStorage.getItem('vanta.desktop.pinnedSessions') || '[]');
    return !pins.includes('absent-owned-draft') && !pins.includes('absent-legacy-draft');
  });
  checks.push('empty-history startup reconciles pinned references without creating a chat');
  await current.page.waitForTimeout(3_000);
  const records = await current.page.evaluate(() => JSON.parse(localStorage.getItem('desktop:composer-drafts:v4')).drafts);
  assert.deepEqual(records[owned], fixtures[owned]);
  assert.deepEqual(records['absent-legacy-draft'], fixtures['absent-legacy-draft']);
  checks.push('owned and unassigned legacy draft text and revisions survive startup cleanup');
  assert.equal(model.requests.length, 0);
  assert.deepEqual(sessionFiles(), []);
  checks.push('the private session store stays empty across both launches');
  assert.deepEqual(errors.flat(), []);
  checks.push('cleanup invokes no additional model and emits no renderer errors');
  await current.page.screenshot({ path: path.join(output, 'retained-drafts.png') });
} catch (error) {
  failure = String(error.stack ?? error);
  const diagnostic = await current?.page.evaluate(() => ({
    storage: Object.fromEntries(Object.entries(localStorage).filter(([key]) => /pinnedSessions|composer-drafts/.test(key)))
  })).catch(() => null);
  fs.writeFileSync(path.join(output, 'diagnostic.json'), JSON.stringify(diagnostic, null, 2));
  await current?.page.screenshot({ path: path.join(output, 'FAIL.png') }).catch(() => {});
} finally {
  await current?.app.close().catch(() => {});
  await model.close(); killLeftovers(box);
  const result = { pass: !failure, checks, failure, source: root, sandbox: box.root,
    rendererErrors: errors.flat(), requests: model.requests };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, pass: result.pass, checks: checks.length, failure, errors: result.rendererErrors.length }));
  if (failure) process.exitCode = 1;
}
