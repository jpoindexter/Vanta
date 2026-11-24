import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.VANTA_PROOF_SOURCE;
assert.ok(root, 'An isolated source snapshot is required');
const from = file => import(pathToFileURL(path.join(root, 'desktop-next/tools', file)));
const { makeSandbox, launchApp, killLeftovers } = await from('done-path/harness.mjs');
const { waitForShell, newChat, composerText } = await from('done-path/lib.mjs');
const { startScriptedModel } = await from('done-path/scripted-model.mjs');
const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: true });
const box = await makeSandbox(), model = await startScriptedModel();
let current, failure;
const checks = [];

try {
  current = await launchApp({ box, project: box.projectA, modelUrl: model.url });
  const page = current.page;
  page.setDefaultTimeout(15000);
  await waitForShell(page);
  const later = page.getByRole('button', { name: /choose a provider later/i });
  if (await later.isVisible().catch(() => false)) await later.click();
  await page.getByText('ready', { exact: true }).first().waitFor();
  await newChat(page);
  await page.locator("[data-vp='composer-input']").first().click();
  await page.keyboard.insertText('Private default-profile draft.');
  await page.waitForTimeout(800);
  assert.equal(await composerText(page), 'Private default-profile draft.');
  checks.push('default profile retains an unsent fixture draft');
  await page.keyboard.press('Meta+k');
  await page.locator('[cmdk-input]').fill('Profiles');
  await page.getByRole('option', { name: 'Profiles', exact: true }).waitFor();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'New profile', exact: true }).click();
  await page.locator('#new-profile-name').fill('owner-b');
  await page.getByRole('dialog').getByRole('button', { name: 'Create profile', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const created = await page.evaluate(() => window.desktopBridge.api({ path: '/api/profiles' }));
  fs.writeFileSync(path.join(output, 'created.json'), JSON.stringify(created, null, 2));
  assert.ok(created.profiles.some(row => row.id === 'owner-b'));
  checks.push('real Create Profile screen creates the second profile through the renderer adapter');
  const routing = await page.evaluate(async () => {
    const b = window.desktopBridge;
    const attempt = async fn => { try { return { value: await fn() }; } catch(error) { return { error: String(error) }; } };
    const primary = await b.getConnection();
    const before = await b.profile.get();
    const named = await attempt(() => b.getConnection('owner-b'));
    const foreign = await attempt(() => b.getConnectionFor({ connectionId: 'nonexistent-device', profile: 'default' }));
    const remember = await attempt(() => b.profile.remember('owner-b'));
    const choose = await attempt(() => b.profile.set('owner-b'));
    const api = await attempt(() => b.api({ path: '/api/status', profile: 'owner-b' }));
    const effect = await b.vanta.request({ method: 'POST', path: '/api/chat', profile: 'owner-b', clientId: 'refused-profile-fixture',
      body: { instruction: 'This wrong-owner fixture must never reach a model.' } });
    return { primary: { profile: primary.profile }, before, named, foreign, remember, choose, api,
      effect: { ok: effect.ok, status: effect.status, error: effect.data?.error }, after: await b.profile.get() };
  });
  fs.writeFileSync(path.join(output, 'routing.json'), JSON.stringify(routing, null, 2));
  assert.equal(routing.primary.profile, 'default');
  assert.deepEqual(routing.before, { profile: 'default' });
  assert.match(routing.named.error, /not running here/);
  assert.match(routing.foreign.error, /not connected/);
  assert.match(routing.remember.error, /not running here/);
  assert.match(routing.choose.error, /not running here/);
  assert.ok(await page.evaluate(() => (localStorage.getItem('desktop:composer-drafts:v3') || localStorage.getItem('desktop:composer-drafts:v4') || '').includes('Private default-profile draft.')), 'the original unsent words survive refused routing');
  assert.match(routing.api.error, /409:/);
  assert.equal(routing.effect.ok, false);
  assert.equal(routing.effect.status, 409);
  assert.match(routing.effect.error, /not running here/);
  assert.deepEqual(routing.after, routing.before);
  checks.push('native descriptor, profile choice, REST and direct effect refuse another owner without changing the active profile');
  assert.equal(model.requests.length, 0);
  checks.push('profile creation does not invoke the model');
  await page.screenshot({ path: path.join(output, 'created.png') });
} catch (error) {
  failure = String(error.stack ?? error);
  await current?.page.screenshot({ path: path.join(output, 'FAIL.png') }).catch(() => {});
} finally {
  if (current) fs.writeFileSync(path.join(output, 'body.txt'), await current.page.locator('body').innerText().catch(() => 'Unavailable'));
  await current?.app.close().catch(() => {});
  await model.close();
  killLeftovers(box);
  const result = { pass: !failure, checks, failure, requests: model.requests.length, rendererErrors: current?.errors, sandbox: box.root };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (failure) process.exitCode = 1;
}
