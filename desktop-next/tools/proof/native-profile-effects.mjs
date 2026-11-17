// Existing source build, private homes/projects, loopback provider only. Never touches the owner's terminal or account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.env.VANTA_PROOF_SOURCE;
assert.ok(root);
const free = fs.statfsSync(root);
assert.ok(free.bavail * free.bsize > 5 * 1024 ** 3 + 16 * 1024 ** 2, 'Keep at least 5 GiB free during this small proof');
const from = file => import(pathToFileURL(path.join(root, 'desktop-next/tools', file)));
const { makeSandbox, launchApp, killLeftovers } = await from('done-path/harness.mjs');
const { newChat, sendText, waitFinished, waitForShell, sleep } = await from('done-path/lib.mjs');
const { startScriptedModel } = await from('done-path/scripted-model.mjs');
const output = path.resolve(process.argv[2]); fs.mkdirSync(output, { recursive: true });
const box = await makeSandbox(), model = await startScriptedModel();
let pendingBackground = 0;
const capturedModels = [];
const proxy = http.createServer(async (request, response) => {
  if (request.url?.endsWith('/models')) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ object: 'list', data: ['done-path', 'base-profile-proof'].map(id => ({ id, object: 'model' })) }));
    return;
  }
  let body = ''; for await (const chunk of request) body += chunk;
  if (request.url?.endsWith('/chat/completions')) capturedModels.push(JSON.parse(body).model);
  const delayed = body.includes('Background writer') || body.includes('Background sticky');
  if (delayed) { pendingBackground += 1; await sleep(1500); pendingBackground -= 1; }
  const result = await fetch(new URL(request.url, model.url).href, { method: request.method,
    ...(body ? { body } : {}), headers: { 'content-type': 'application/json' } });
  response.writeHead(result.status, { 'content-type': result.headers.get('content-type') ?? 'application/json' });
  response.end(await result.text());
});
await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
const modelUrl = 'http://127.0.0.1:' + proxy.address().port + '/v1';
const checks = []; let current, failure;
const until = async check => { const end = Date.now() + 30_000; while (!await check()) { assert.ok(Date.now() < end, 'bounded proof condition timed out'); await sleep(100); } };
try {
  const store = pathToFileURL(path.join(root, 'vanta-ts/src/profiles/store.ts')).href;
  const policies = pathToFileURL(path.join(root, 'vanta-ts/src/operator-profile/profile.ts')).href;
  execFileSync(process.execPath, ['--import', path.join(root, 'vanta-ts/node_modules/tsx/dist/loader.mjs'), '--input-type=module', '-e',
    `import {createProfile,switchProfile} from ${JSON.stringify(store)};
      import {defaultOperatorProfile,writeOperatorProfile} from ${JSON.stringify(policies)};
      const writer=await createProfile({name:'writer',provider:'custom',model:'done-path'});
      await writeOperatorProfile({...defaultOperatorProfile(),approvalPreferences:{shell_cmd:'always_ask'}},{VANTA_HOME:writer.home});
      await createProfile({name:'sticky',provider:'custom',model:'done-path'});
      await switchProfile('writer');`], { env: { PATH: process.env.PATH, HOME: box.home, VANTA_HOME: box.vantaHome }, stdio: 'pipe' });
  current = await launchApp({ box, project: box.projectA, modelUrl, extraEnv: { VANTA_PROFILE: 'writer', VANTA_MODEL: 'base-profile-proof' } });
  await waitForShell(current.page);
  const later = current.page.getByRole('button', { name: /choose a provider later/i });
  if (await later.isVisible().catch(() => false)) await later.click();
  await current.page.getByText('ready', { exact: true }).first().waitFor();
  await current.app.evaluate(({ ipcMain }) => {
    globalThis.__streams = [];
    ipcMain.on('vanta:events:open', (_event, streamId, clientId, owner) => globalThis.__streams.push({ streamId, clientId, owner }));
  });
  await newChat(current.page); await sendText(current.page, 'Native effect anchor.');
  assert.equal(await waitFinished(current.page), true);
  const rows = await current.app.evaluate(() => globalThis.__streams);
  const clientId = rows.findLast(row => row.owner?.profile === 'writer')?.clientId;
  assert.ok(clientId);
  const terminal = await current.page.evaluate(async () => {
    const value = await window.desktopBridge.terminal.start();
    window.__nativeOutput = '';
    window.desktopBridge.terminal.onData(value.id, text => { window.__nativeOutput += text; });
    return value.id;
  });
  const command = "printf 'native writer approved' >> native-writer-proof.txt";
  await current.page.evaluate(([id, command]) => window.desktopBridge.terminal.write(id, command + '\r'), [terminal, command]);
  const card = current.page.locator('[data-vp="approval-card"]').first();
  await card.waitFor({ state: 'visible' });
  assert.ok((await card.innerText()).includes('native-writer-proof.txt'));
  assert.equal(fs.existsSync(path.join(box.projectA, 'native-writer-proof.txt')), false);
  const scoped = await current.page.evaluate(async clientId => {
    const call = (profile, method, body) => window.desktopBridge.vanta.request({ method, path: '/api/approval', clientId, profile, ...(body ? { body } : {}) });
    const own = await call('writer', 'GET');
    return { own, other: await call('sticky', 'GET'), denied: await call('sticky', 'POST', { id: own.data.id, decision: 'allow' }) };
  }, clientId);
  assert.ok(scoped.own.data.id); assert.equal(scoped.other.data, null); assert.equal(scoped.denied.status, 404);
  if (await later.isVisible().catch(() => false)) await later.click();
  await card.getByRole('button', { name: 'Allow once', exact: true }).click();
  await until(() => fs.existsSync(path.join(box.projectA, 'native-writer-proof.txt')));
  await card.waitFor({ state: 'hidden' });
  assert.equal(fs.readFileSync(path.join(box.projectA, 'native-writer-proof.txt'), 'utf8'), 'native writer approved');
  checks.push('real native terminal honors writer’s saved always-ask policy; same-client sticky cannot read or approve it; one Allow once appends exactly the expected bytes to an initially absent file, exposing duplicate execution');
  fs.writeFileSync(path.join(box.projectA, 'stage-proof.txt'), 'stage only this fixture\n');
  await current.page.evaluate(project => {
    window.__gitResult = null;
    void window.desktopBridge.git.review.stage(project, 'stage-proof.txt').then(value => window.__gitResult = { ok: true, value }, error => window.__gitResult = { error: String(error) });
  }, box.projectA);
  await card.waitFor({ state: 'visible' });
  await until(async () => (await card.innerText()).includes('stage-proof.txt'));
  assert.ok((await card.innerText()).includes('stage-proof.txt'));
  assert.equal(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: box.projectA, encoding: 'utf8' }), '');
  await card.getByRole('button', { name: 'Allow once', exact: true }).click();
  await current.page.waitForFunction(() => window.__gitResult !== null);
  assert.equal((await current.page.evaluate(() => window.__gitResult)).ok, true);
  assert.equal(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: box.projectA, encoding: 'utf8' }).trim(), 'stage-proof.txt');
  checks.push('real native Git stage remains behind its exact approval and stages only the intended private fixture file');
  await current.page.evaluate(() => {
    window.__backgroundFrames = { writer: [], sticky: [] }; window.__backgroundStops = {};
    for (const profile of ['writer', 'sticky']) window.__backgroundStops[profile] = window.desktopBridge.vanta.openEvents('same-background-client', {
      onFrame: frame => window.__backgroundFrames[profile].push(frame), onClose: reason => { window.__backgroundFrames[profile].push({ closed: reason }); }
    }, { connectionId: 'local', profile });
  });
  await until(async () => {
    const result = await current.page.evaluate(() => window.desktopBridge.vanta.request({ method: 'POST', path: '/api/terminal', clientId: 'same-background-client', body: { command: 'must not execute' } }));
    return result.status === 409 && result.data.error.includes('more than one profile');
  });
  checks.push('a same-ID chat on two live profiles makes an untagged native effect fail closed before execution');
  const queryRefusals = await current.page.evaluate(async () => {
    const answers = [];
    for (const path of ['/api/terminal?probe=1', '/api/terminal#fragment', '/api/terminal?probe=1#fragment']) {
      for (const clientId of [undefined, 'stale-client', 'same-background-client']) answers.push(await window.desktopBridge.vanta.request({
        method: 'POST', path, ...(clientId ? { clientId } : {}), body: { command: "printf 'wrong owner' > query-must-not-run.txt" }
      }));
    }
    return answers;
  });
  assert.ok(queryRefusals.every(answer => answer.status === 409 && answer.ok === false));
  assert.equal(fs.existsSync(path.join(box.projectA, 'query-must-not-run.txt')), false);
  checks.push('query/fragment terminal spellings refuse missing, stale and ambiguous owners with no fixture effect or primary fallback');
  await current.page.evaluate(() => {
    window.__backgroundResults = null;
    void Promise.all(['writer', 'sticky'].map(profile => window.desktopBridge.vanta.request({ method: 'POST', path: '/api/chat',
      profile, connectionId: 'local', clientId: 'same-background-client', body: {
        message: profile === 'writer' ? 'Background writer [[call read_file {"path":"brief.md"}]]' : 'Background sticky [[call read_file {"path":"README.md"}]]'
      } }))).then(results => window.__backgroundResults = results);
  });
  await until(() => pendingBackground === 2);
  await current.page.getByRole('button', { name: /^sticky(?:,|$)/i }).first().click();
  await current.page.waitForFunction(() => window.__backgroundResults !== null);
  const results = await current.page.evaluate(() => window.__backgroundResults);
  assert.ok(results.every(result => result.ok && result.data.finalText === 'Scripted turn finished.'));
  await current.page.waitForFunction(() => ['writer', 'sticky'].every(profile => window.__backgroundFrames[profile].some(frame => frame.typed?.type === 'turn.complete')));
  const frames = await current.page.evaluate(() => window.__backgroundFrames);
  for (const [profile, own, other] of [['writer', 'brief.md', 'README.md'], ['sticky', 'README.md', 'brief.md']]) {
    assert.equal(frames[profile].filter(frame => frame.typed?.type === 'turn.complete').length, 1);
    assert.ok(frames[profile].some(frame => frame.typed?.type === 'tool.start' && frame.typed.args.path === own));
    assert.ok(!frames[profile].some(frame => frame.typed?.type === 'tool.start' && frame.typed.args.path === other));
    assert.ok(!frames[profile].some(frame => frame.closed));
  }
  fs.writeFileSync(path.join(output, 'background-frames.json'), JSON.stringify(frames, null, 2));
  checks.push('two real same-ID background chats keep separate tool/complete streams while the foreground changes profiles; exactly one completion per owner and no cross-frame');
  await current.page.evaluate(() => Object.values(window.__backgroundStops).forEach(stop => stop()));
  const namedBefore = ['writer', 'sticky'].map(profile => fs.readdirSync(path.join(box.vantaHome, 'profiles', profile, 'sessions')).filter(name => name.endsWith('.json')).sort());
  const catalog = await current.page.evaluate(() => window.desktopBridge.vanta.request({ method: 'GET', path: '/api/profiles' }));
  const base = catalog.data.profiles.find(profile => profile.id === 'default');
  assert.equal(base.home, box.vantaHome); assert.equal(base.provider, 'custom'); assert.equal(base.model, 'base-profile-proof');
  assert.equal(catalog.data.profiles.find(profile => profile.id === 'writer').model, 'done-path');
  const defaultConnection = await current.page.evaluate(() => window.desktopBridge.getConnectionFor({ connectionId: 'local', profile: 'default' }));
  assert.equal(defaultConnection.profile, 'default');
  const answer = await current.page.evaluate(() => window.desktopBridge.vanta.request({ method: 'POST', path: '/api/chat',
    connectionId: 'local', profile: 'default', clientId: 'base-child-proof', body: { message: 'Actual default child proof.' } }));
  assert.equal(answer.ok, true); assert.equal(answer.data.finalText, 'Scripted turn finished.');
  assert.equal(capturedModels.at(-1), 'base-profile-proof');
  const baseFiles = fs.readdirSync(path.join(box.vantaHome, 'sessions')).filter(name => name.endsWith('.json'));
  assert.equal(baseFiles.length, 1); assert.match(fs.readFileSync(path.join(box.vantaHome, 'sessions', baseFiles[0]), 'utf8'), /Actual default child proof/);
  assert.deepEqual(['writer', 'sticky'].map(profile => fs.readdirSync(path.join(box.vantaHome, 'profiles', profile, 'sessions')).filter(name => name.endsWith('.json')).sort()), namedBefore);
  assert.ok(fs.existsSync(path.join(box.projectA, '.vanta', 'api-token')));
  const defaultToken = fs.readFileSync(path.join(box.projectA, '.vanta', 'api-token'), 'utf8').trim();
  const privateTokens = ['writer', 'sticky'].map(profile => {
    const parent = path.join(box.vantaHome, 'profiles', profile, 'kernel-state');
    return fs.readFileSync(path.join(parent, fs.readdirSync(parent).find(name => /^[a-f0-9]{64}$/.test(name)), 'api-token'), 'utf8').trim();
  });
  assert.ok(privateTokens.every(token => token !== defaultToken));
  const baseRun = path.join(box.vantaHome, 'run');
  const basePid = JSON.parse(fs.readFileSync(path.join(baseRun, fs.readdirSync(baseRun).find(name => /^kernel-\d+\.json$/.test(name))), 'utf8'));
  const approvals = 'http://127.0.0.1:' + basePid.port + '/api/approvals';
  assert.equal((await fetch(approvals, { headers: { authorization: 'Bearer ' + defaultToken } })).status, 200);
  for (const token of privateTokens) assert.equal((await fetch(approvals, { headers: { authorization: 'Bearer ' + token } })).status, 401);
  const runtimeLog = fs.readFileSync(path.join(box.userData, 'logs', 'runtime.log'), 'utf8');
  for (const token of [defaultToken, ...privateTokens]) assert.ok(!runtimeLog.includes(token));
  assert.ok(!/#boundary=[a-f0-9]{64}/.test(runtimeLog));
  assert.ok((runtimeLog.match(/#boundary=\[redacted\]/g) ?? []).length >= 3);
  fs.writeFileSync(path.join(output, 'token-absence.json'), JSON.stringify({ pass: true, privateKernelTokensAbsent: 3, redactedLaunchUrls: (runtimeLog.match(/#boundary=\[redacted\]/g) ?? []).length }));
  checks.push('actual default child uses the base catalog home/provider and distinct base model in its captured loopback request, writes only base history and retains legacy project kernel state');
  assert.deepEqual(current.errors, []);
  assert.equal(model.requests.length, 6);
  checks.push('six deliberate loopback model requests and zero renderer errors; terminal append proves its exact effect count, Git proof establishes intended index state only');
} catch (error) {
  failure = String(error.stack ?? error);
  if (current) {
    fs.writeFileSync(path.join(output, 'FAIL-body.txt'), await current.page.locator('body').innerText().catch(() => 'Unavailable'));
    fs.writeFileSync(path.join(output, 'FAIL-terminal.txt'), await current.page.evaluate(() => window.__nativeOutput ?? '').catch(() => 'Unavailable'));
    await current.page.screenshot({ path: path.join(output, 'FAIL.png') }).catch(() => {});
  }
} finally {
  await current?.app.close().catch(() => {});
  proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve));
  await model.close(); killLeftovers(box);
  const result = { pass: !failure, checks, failure, source: root, sandbox: box.root, modelRequests: model.requests.length,
    rendererErrors: current?.errors ?? [], notChecked: ['packaged installation', 'owner state', 'live external services'] };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  if (failure) process.exitCode = 1;
}
