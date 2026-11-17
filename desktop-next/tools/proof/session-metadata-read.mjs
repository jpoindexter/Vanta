// Run the actual native bridge against an isolated source build; no owner state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.VANTA_PROOF_SOURCE;
assert.ok(root, 'An isolated source or explicit canonical checkout is required');
const from = file => import(pathToFileURL(path.join(root, 'desktop-next/tools', file)));
const { makeSandbox, launchApp, killLeftovers } = await from('done-path/harness.mjs');
const { newChat, sendText, waitFinished, waitForShell, sleep } = await from('done-path/lib.mjs');
const { startScriptedModel } = await from('done-path/scripted-model.mjs');
const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: true });
const box = await makeSandbox(), model = await startScriptedModel();
const checks = [];
let current, failure;
try {
  current = await launchApp({ box, project: box.projectA, modelUrl: model.url });
  await waitForShell(current.page);
  const later = current.page.getByRole('button', { name: /choose a provider later/i });
  if (await later.isVisible().catch(() => false)) await later.click();
  await current.page.getByText('ready', { exact: true }).first().waitFor();
  await newChat(current.page);
  await sendText(current.page, 'Read-only metadata acceptance anchor.');
  assert.equal(await waitFinished(current.page), true);
  const dir = path.join(box.vantaHome, 'sessions');
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.json'));
  assert.equal(files.length, 1);
  const file = path.join(dir, files[0]);
  // Streamed text precedes the final save; compare bytes only after that turn is persisted.
  const deadline = Date.now() + 10_000;
  while (JSON.parse(fs.readFileSync(file, 'utf8')).messages.at(-1)?.desktopRun?.status !== 'done' && Date.now() < deadline) {
    await sleep(100);
  }
  const before = fs.readFileSync(file, 'utf8'), saved = JSON.parse(before);
  assert.equal(saved.messages.at(-1)?.desktopRun?.status, 'done');
  assert.equal(saved.messages.at(-1)?.content, 'Scripted turn finished.');
  const reads = await current.page.evaluate(async id => {
    const read = async query => {
      try { return { value: await window.desktopBridge.api({ path: '/api/sessions/detail?' + query,
        connectionId: 'local', profile: 'default' }) }; }
      catch (error) { return { error: String(error) }; }
    };
    return [await read(new URLSearchParams({ id, profile: 'default' }).toString()),
      await read('id=absent-metadata-fixture&profile=default'), await read('id=' + encodeURIComponent(id) + '&profile=other')];
  }, saved.id);
  assert.equal(reads[0].value.id, saved.id);
  assert.equal(reads[0].value.cwd, saved.cwd);
  assert.equal(reads[0].value.modelId, saved.modelId);
  assert.equal(reads[0].value.turns, 1);
  assert.ok(!('messages' in reads[0].value) && !('systemPrompt' in reads[0].value));
  checks.push('actual native bridge returns exact saved metadata without transcript or system prompt');
  assert.match(reads[1].error, /404: session not found/);
  assert.match(reads[2].error, /409: .*cannot read that profile/);
  checks.push('missing and unsupported-profile reads refuse distinctly');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(model.requests.length, 1);
  assert.deepEqual(current.errors, []);
  checks.push('metadata reads preserve exact saved bytes and invoke no additional model');
} catch (error) { failure = String(error.stack ?? error); }
finally {
  await current?.app.close().catch(() => {});
  await model.close(); killLeftovers(box);
  const result = { pass: !failure, checks, failure, source: root, sandbox: box.root,
    rendererErrors: current?.errors ?? [], modelRequests: model.requests.length };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (failure) process.exitCode = 1;
}
