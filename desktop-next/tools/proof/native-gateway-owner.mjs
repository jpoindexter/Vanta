// Actual source Electron: the connection owner accompanies chat and event subscriptions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.VANTA_PROOF_SOURCE;
assert.ok(root, 'An explicit isolated source checkout is required');
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
  await current.app.evaluate(({ ipcMain }) => {
    globalThis.__ownerStreams = [];
    ipcMain.on('vanta:events:open', (_event, streamId, clientId, owner) => {
      globalThis.__ownerStreams.push({ streamId, clientId, owner });
    });
  });
  const connection = await current.page.evaluate(() => window.desktopBridge.getConnection());
  assert.equal(new URL(connection.wsUrl).searchParams.get('profile'), 'default');
  assert.equal(connection.profile, 'default');
  checks.push('the real native connection URL carries the verified running profile');
  await newChat(current.page);
  await sendText(current.page, 'Owner-pinned ordinary chat.');
  assert.equal(await waitFinished(current.page), true);
  const dir = path.join(box.vantaHome, 'sessions');
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.json'));
  assert.equal(files.length, 1);
  const file = path.join(dir, files[0]);
  const deadline = Date.now() + 10_000;
  while (JSON.parse(fs.readFileSync(file, 'utf8')).messages.at(-1)?.desktopRun?.status !== 'done' && Date.now() < deadline) {
    await sleep(100);
  }
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.messages.at(-1)?.desktopRun?.status, 'done');
  assert.equal(saved.messages.at(-1)?.content, 'Scripted turn finished.');
  const streams = await current.app.evaluate(() => globalThis.__ownerStreams);
  assert.ok(streams.length > 0);
  assert.ok(streams.every(row => row.owner?.profile === 'default' && row.owner?.connectionId === 'local'));
  fs.writeFileSync(path.join(output, 'chat-streams.json'), JSON.stringify(streams, null, 2));
  checks.push('ordinary renderer chat opens owner-pinned native streams and saves its exact completed reply');
  const refused = await current.page.evaluate(async () => {
    const attempt = owner => new Promise(resolve => {
      let frames = 0, stop = () => {};
      const timer = setTimeout(() => { stop(); resolve({ timeout: true, frames }); }, 5000);
      stop = window.desktopBridge.vanta.openEvents('wrong-owner-stream', {
        onFrame: () => { frames += 1; },
        onClose: reason => { clearTimeout(timer); stop(); resolve({ reason, frames }); }
      }, owner);
    });
    return [await attempt({ profile: 'not-running-here', connectionId: 'local' }),
      await attempt({ profile: 'default', connectionId: 'not-connected' })];
  });
  assert.match(refused[0].reason, /not running here/);
  assert.match(refused[1].reason, /not connected/);
  assert.ok(refused.every(row => row.frames === 0));
  checks.push('wrong-profile and foreign-device native streams close with their exact refusal and no frame');
  assert.equal(model.requests.length, 1);
  assert.deepEqual(current.errors, []);
  checks.push('one intentional loopback model turn, with no duplicate request or renderer error');
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
