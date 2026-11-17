// Packaged first-run proof only. A private Ollama-compatible loopback fixture supplies model discovery/chat.
// VANTA_PACKAGED_APP=/path/Vanta.app node tools/done-path/first-launch.mjs (from desktop-next).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { startMockOpenAI } from '../mock-openai.mjs';
import { launchApp, makeSandbox } from './harness.mjs';
import { newChat, waitForShell } from './lib.mjs';

const HEADER = "Let's get you setup with Vanta";
const REPLY = 'Hello from the proof model. This reply is canned: it exists so the app can show a chat with messages.';

function fixture(mock) {
  const requests = [];
  let online = false;
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/api/tags') {
      res.writeHead(online ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify(online ? { models: [{ name: 'qwen2.5:14b' }] } : { error: 'Synthetic local model is stopped.' }));
      return;
    }
    const target = http.request(mock.url.replace(/\/v1$/, '') + req.url,
      { method: req.method, headers: req.headers }, response => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      });
    target.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(target);
  });
  return { server, requests, start: () => { online = true; } };
}

async function chooseLocal(ctx, local) {
  await ctx.page.getByRole('button', { name: /^Local \/ custom endpoint/ }).click();
  const endpoint = ctx.page.getByPlaceholder('http://127.0.0.1:8000/v1');
  await endpoint.fill('http://localhost:11434');
  await ctx.page.getByRole('button', { name: 'Connect', exact: true }).click();
  await ctx.page.getByText(/Ollama is not answering at http:\/\/localhost:11434/).waitFor();
  assert.equal(await endpoint.inputValue(), 'http://localhost:11434');
  local.start();
  await ctx.page.getByRole('button', { name: 'Connect', exact: true }).click();
  await ctx.page.getByText(HEADER, { exact: true }).waitFor({ state: 'hidden', timeout: 30000 });
}

async function skipAndDraft(ctx) {
  await waitForShell(ctx.page);
  assert.equal(await ctx.app.evaluate(({ app }) => app.isPackaged), true);
  await ctx.page.getByRole('button', { name: "I'll choose a provider later" }).click();
  await newChat(ctx.page);
  await ctx.page.getByRole('textbox', { name: 'Message Vanta' }).fill('Unsent first-run draft');
}

async function recoverSetup(ctx, local, evidence) {
  await waitForShell(ctx.page);
  assert.equal(await ctx.page.getByText(HEADER, { exact: true }).count(), 0);
  assert.equal(await ctx.page.getByRole('textbox', { name: 'Message Vanta' }).textContent(), 'Unsent first-run draft');
  await ctx.page.getByRole('textbox', { name: 'Message Vanta' }).press('Enter');
  await ctx.page.getByText(HEADER, { exact: true }).waitFor({ timeout: 30000 });
  await chooseLocal(ctx, local);
  assert.equal(local.requests.filter(url => url.endsWith('/chat/completions')).length, 0);
  // A rejected send remains in custody until the user explicitly restores it; setup never replays it.
  const restore = ctx.page.getByRole('button', { name: 'Restore without sending', exact: true });
  await restore.click();
  await restore.waitFor({ state: 'hidden' });
  assert.equal(await ctx.page.getByRole('textbox', { name: 'Message Vanta' }).textContent(), 'Unsent first-run draft');
  assert.equal(local.requests.filter(url => url.endsWith('/chat/completions')).length, 0);
  await ctx.page.getByRole('textbox', { name: 'Message Vanta' }).press('Enter');
  await ctx.page.getByText(REPLY, { exact: true }).first().waitFor({ timeout: 45000 });
  await ctx.page.getByRole('button', { name: 'Send', exact: true }).waitFor();
  assert.equal(local.requests.filter(url => url.endsWith('/chat/completions')).length, 1);
  await ctx.page.getByRole('textbox', { name: 'Message Vanta' }).fill('Unsent setup recovery draft');
  await ctx.page.screenshot({ path: path.join(evidence, 'setup-chat.png') });
  assert.deepEqual(ctx.errors, []);
  return ctx.page.url();
}

async function verifyRestart(ctx, chatUrl, evidence) {
  await waitForShell(ctx.page);
  await ctx.page.getByText(REPLY, { exact: true }).first().waitFor({ timeout: 30000 });
  assert.equal(ctx.page.url(), chatUrl);
  assert.equal(await ctx.page.getByRole('textbox', { name: 'Message Vanta' }).textContent(), 'Unsent setup recovery draft');
  assert.equal(await ctx.page.getByText(HEADER, { exact: true }).count(), 0);
  assert.deepEqual(ctx.errors, []);
  await ctx.page.screenshot({ path: path.join(evidence, 'setup-relaunch.png') });
}

async function run() {
  assert(process.env.VANTA_PACKAGED_APP, 'Select the exact signed app with VANTA_PACKAGED_APP; no source builds are performed.');
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'vanta-first-launch-'));
  const box = await makeSandbox(), mock = await startMockOpenAI(), local = fixture(mock);
  await new Promise(done => local.server.listen(0, '127.0.0.1', done));
  // Only the fixture changes discovery's destination; the UI still uses the supported Ollama setup route.
  const env = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', VANTA_PROVIDER: 'openai',
    VANTA_OLLAMA_URL: `http://127.0.0.1:${local.server.address().port}/v1`, VANTA_KEYCHAIN: '0',
    VANTA_KERNEL_EPHEMERAL: '1', VANTA_FACTORY_DISABLED: '1' };
  let ctx;
  try {
    ctx = await launchApp({ box, project: box.projectA, extraEnv: env });
    await skipAndDraft(ctx);
    await ctx.app.close(); ctx = null;
    ctx = await launchApp({ box, project: box.projectA, extraEnv: env });
    const chatUrl = await recoverSetup(ctx, local, evidence);
    await ctx.app.close(); ctx = null;
    const savedEnv = { ...env }; delete savedEnv.VANTA_PROVIDER;
    ctx = await launchApp({ box, project: box.projectA, extraEnv: savedEnv });
    await verifyRestart(ctx, chatUrl, evidence);
    console.log(JSON.stringify({ passed: ['missing-provider picker', 'choose-later persists across quit/relaunch',
      'unsent draft survives skipped setup', 'submission reopens required setup', 'offline model preserves endpoint and retry',
      'same-chat first response with one model request', 'configured restart skips setup and retains chat/draft'],
      app: process.env.VANTA_PACKAGED_APP, evidence, box, requests: local.requests, errors: ctx.errors }));
  } catch (error) {
    if (ctx) await ctx.page.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {});
    console.error(`First-launch proof failed; private evidence: ${evidence}; isolated profile: ${box.root}`);
    throw error;
  } finally {
    if (ctx) await ctx.app.close();
    await new Promise(done => local.server.close(done));
    await mock.close();
  }
}

await run();
