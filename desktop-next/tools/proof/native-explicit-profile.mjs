// One real named runtime, not a claim that parallel profile kernels are isolated yet.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.env.VANTA_PROOF_SOURCE;
assert.ok(root, 'An explicit isolated source checkout is required');
const from = file => import(pathToFileURL(path.join(root, 'desktop-next/tools', file)));
const { makeSandbox, launchApp, killLeftovers } = await from('done-path/harness.mjs');
const { composerText, newChat, sendText, waitFinished, waitForShell, sleep } = await from('done-path/lib.mjs');
const { startScriptedModel } = await from('done-path/scripted-model.mjs');
const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: true });
const box = await makeSandbox(), model = await startScriptedModel();
const checks = [];
let current, failure;
try {
  const legacyDirectory = path.join(box.projectA, '.vanta');
  fs.mkdirSync(legacyDirectory, { recursive: true });
  const legacyApprovals = '99\tfixture legacy action\task\ttrue\tapproved\tfixture-only authority\n';
  fs.writeFileSync(path.join(legacyDirectory, 'approvals.tsv'), legacyApprovals);
  fs.writeFileSync(path.join(legacyDirectory, 'api-token'), 'fixture-project-token');
  const store = pathToFileURL(path.join(root, 'vanta-ts/src/profiles/store.ts')).href;
  execFileSync(process.execPath, ['--import', path.join(root, 'vanta-ts/node_modules/tsx/dist/loader.mjs'),
    '--input-type=module', '-e', `import {createProfile,switchProfile} from ${JSON.stringify(store)};
      await createProfile({name:'writer',provider:'custom',model:'done-path'});
      await createProfile({name:'sticky',provider:'custom',model:'unused-model'});
      await switchProfile('sticky');`],
  { env: { PATH: process.env.PATH, HOME: box.home, VANTA_HOME: box.vantaHome }, stdio: 'pipe' });
  const activeFile = path.join(box.vantaHome, 'profiles', 'active.json');
  const stickyBefore = fs.readFileSync(activeFile, 'utf8');
  current = await launchApp({ box, project: box.projectA, modelUrl: model.url, extraEnv: { VANTA_PROFILE: 'writer' } });
  await waitForShell(current.page);
  const later = current.page.getByRole('button', { name: /choose a provider later/i });
  if (await later.isVisible().catch(() => false)) await later.click();
  await current.page.getByText('ready', { exact: true }).first().waitFor();
  const connection = await current.page.evaluate(() => window.desktopBridge.getConnection());
  assert.equal(connection.profile, 'writer');
  assert.equal(new URL(connection.wsUrl).searchParams.get('profile'), 'writer');
  checks.push('real native startup honors explicit writer instead of sticky profile');
  const catalog = await current.page.evaluate(() => window.desktopBridge.vanta.request({ method: 'GET', path: '/api/profiles' }));
  assert.equal(catalog.ok, true);
  assert.equal(catalog.data.profiles.find(row => row.id === 'default').home, box.vantaHome);
  assert.equal(catalog.data.profiles.find(row => row.isDefault).id, 'sticky');
  checks.push('base catalog home and persisted sticky default remain distinct from the running writer');
  fs.writeFileSync(path.join(output, 'buttons.json'), JSON.stringify(await current.page.getByRole('button').evaluateAll(buttons =>
    buttons.map(button => ({ label: button.getAttribute('aria-label'), text: button.textContent?.slice(0, 60) }))), null, 2));
  const writerButton = current.page.getByRole('button', { name: /^writer(?:,|$)/i }).first();
  await writerButton.click();
  await current.page.waitForFunction(() => [...document.querySelectorAll('button')].some(button =>
    /^writer(?:,|$)/i.test(button.getAttribute('aria-label') ?? '') && button.getAttribute('aria-pressed') === 'true'));
  checks.push('the visible profile picker activates writer before the ordinary chat');
  await sendText(current.page, 'Explicit-profile native proof.');
  assert.equal(await waitFinished(current.page), true);
  const directory = path.join(box.vantaHome, 'profiles/writer/sessions');
  const files = fs.readdirSync(directory).filter(file => file.endsWith('.json'));
  assert.equal(files.length, 1);
  const file = path.join(directory, files[0]);
  const deadline = Date.now() + 10_000;
  while (JSON.parse(fs.readFileSync(file, 'utf8')).messages.at(-1)?.desktopRun?.status !== 'done' && Date.now() < deadline) await sleep(100);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).messages.at(-1)?.content, 'Scripted turn finished.');
  assert.equal(fs.existsSync(path.join(box.vantaHome, 'sessions')), false);
  assert.equal(fs.existsSync(path.join(box.vantaHome, 'profiles/sticky/sessions')), false);
  assert.equal(fs.readFileSync(activeFile, 'utf8'), stickyBefore);
  checks.push('ordinary renderer chat stores the completed reply only in writer, without changing sticky default');
  const kernelFor = profile => {
    const home = path.join(box.vantaHome, 'profiles', profile);
    const stateRoot = path.join(home, 'kernel-state');
    const directory = fs.readdirSync(stateRoot).find(name => /^[a-f0-9]{64}$/.test(name));
    assert.ok(directory);
    const state = path.join(stateRoot, directory);
    const run = path.join(home, 'run');
    const pid = fs.readdirSync(run).find(name => /^kernel-\d+\.json$/.test(name));
    assert.ok(pid);
    return { state, token: fs.readFileSync(path.join(state, 'api-token'), 'utf8').trim(),
      pid: JSON.parse(fs.readFileSync(path.join(run, pid), 'utf8')) };
  };
  const writer = kernelFor('writer'), sticky = kernelFor('sticky');
  assert.notEqual(writer.token, sticky.token);
  assert.notEqual(writer.pid.port, sticky.pid.port);
  for (const [own, wrong] of [[writer, sticky], [sticky, writer]]) {
    assert.equal(fs.statSync(own.state).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(own.state, 'api-token')).mode & 0o777, 0o600);
    const endpoint = 'http://127.0.0.1:' + own.pid.port;
    const status = await (await fetch(endpoint + '/api/status')).json();
    assert.equal(status.root, box.projectA);
    assert.match(status.scope_id, /^[a-f0-9]{64}$/);
    assert.equal((await fetch(endpoint + '/api/approvals', { headers: { authorization: 'Bearer ' + own.token } })).status, 200);
    assert.equal((await fetch(endpoint + '/api/approvals', { headers: { authorization: 'Bearer ' + wrong.token } })).status, 401);
    assert.equal((await fetch(endpoint + '/api/approvals', { headers: { authorization: 'Bearer fixture-project-token' } })).status, 401);
    assert.deepEqual(await (await fetch(endpoint + '/api/approvals', { headers: { authorization: 'Bearer ' + own.token } })).json(), []);
  }
  assert.equal(fs.readFileSync(path.join(legacyDirectory, 'approvals.tsv'), 'utf8'), legacyApprovals);
  checks.push('two concurrent named kernels retain one safety root but distinct private state, ports and tokens; cross-owner tokens are refused');
  checks.push('existing project approval and token remain untouched and are neither copied nor accepted by either named kernel');
  await current.page.locator("[data-vp='composer-input']").first().click();
  await current.page.keyboard.insertText('Writer existing draft');
  await sleep(500);
  await newChat(current.page);
  await sendText(current.page, 'Sticky-default native proof.');
  assert.equal(await waitFinished(current.page), true);
  const stickySessions = path.join(box.vantaHome, 'profiles/sticky/sessions');
  const stickyFiles = fs.readdirSync(stickySessions).filter(name => name.endsWith('.json'));
  assert.equal(stickyFiles.length, 1);
  assert.match(fs.readFileSync(path.join(stickySessions, stickyFiles[0]), 'utf8'), /Sticky-default native proof/);
  checks.push('generic New chat independently honors the persisted sticky default and keeps its chat outside writer');
  await newChat(current.page);
  const composer = current.page.locator("[data-vp='composer-input']").first();
  await composer.click();
  await current.page.keyboard.insertText('Sticky fresh unsent draft');
  await sleep(500);
  await writerButton.click();
  await current.page.waitForFunction(() => [...document.querySelectorAll('button')].some(button =>
    /^writer(?:,|$)/i.test(button.getAttribute('aria-label') ?? '') && button.getAttribute('aria-pressed') === 'true'));
  assert.equal(await composerText(current.page), '');
  await composer.click();
  await current.page.keyboard.insertText('Writer fresh unsent draft');
  await sleep(800);
  fs.writeFileSync(path.join(output, 'before-quit-drafts.json'), JSON.stringify(await current.page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.includes('draft') || key.includes('Draft')))), null, 2));
  const pids = [writer, sticky].flatMap(kernel => [kernel.pid.kernelPid, kernel.pid.guardPid]);
  await current.app.close();
  current = undefined;
  const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const stoppedBy = Date.now() + 8000;
  while (pids.some(alive) && Date.now() < stoppedBy) await sleep(100);
  assert.ok(pids.every(pid => !alive(pid)), 'quit must stop both profile kernels and guards');
  checks.push('real Electron quit stops both named kernels and guards');
  current = await launchApp({ box, project: box.projectA, modelUrl: model.url, extraEnv: { VANTA_PROFILE: 'writer' } });
  await waitForShell(current.page);
  await current.page.getByText('ready', { exact: true }).first().waitFor();
  await current.page.waitForFunction(() => document.querySelector("[data-vp='composer-input']")?.innerText === 'Sticky fresh unsent draft');
  assert.equal(await composerText(current.page), 'Sticky fresh unsent draft');
  await current.page.getByRole('button', { name: /^writer(?:,|$)/i }).first().click();
  await current.page.waitForFunction(() => [...document.querySelectorAll('button')].some(button =>
    /^writer(?:,|$)/i.test(button.getAttribute('aria-label') ?? '') && button.getAttribute('aria-pressed') === 'true'));
  await current.page.waitForFunction(() => document.querySelector("[data-vp='composer-input']")?.innerText === 'Writer fresh unsent draft');
  assert.equal(await composerText(current.page), 'Writer fresh unsent draft');
  assert.equal(kernelFor('writer').token, writer.token);
  assert.equal(kernelFor('sticky').token, sticky.token);
  assert.equal(fs.readFileSync(activeFile, 'utf8'), stickyBefore);
  checks.push('relaunch and profile navigation restore each exact unsent fresh-chat draft without sending, and reuse only its own private token');
  assert.equal(model.requests.length, 2);
  assert.deepEqual(current.errors, []);
  checks.push('two intentional loopback model turns and zero renderer errors');
} catch (error) {
  failure = String(error.stack ?? error);
  if (current) {
    fs.writeFileSync(path.join(output, 'FAIL-body.txt'), await current.page.locator('body').innerText().catch(() => 'Unavailable'));
    fs.writeFileSync(path.join(output, 'FAIL-drafts.json'), JSON.stringify(await current.page.evaluate(() =>
      Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.includes('draft') || key.includes('Draft')))).catch(() => ({})), null, 2));
    await current.page.screenshot({ path: path.join(output, 'FAIL.png') }).catch(() => {});
  }
}
finally {
  await current?.app.close().catch(() => {});
  await model.close(); killLeftovers(box);
  const result = { pass: !failure, checks, failure, source: root, sandbox: box.root,
    rendererErrors: current?.errors ?? [], modelRequests: model.requests.length,
    notChecked: ['native approval effects', 'simultaneous background chat streams', 'packaged installation', 'owner state'] };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (failure) process.exitCode = 1;
}
