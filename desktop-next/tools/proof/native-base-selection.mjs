import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const root = process.env.VANTA_PROOF_SOURCE; assert.ok(root);
const from = file => import(pathToFileURL(path.join(root, 'desktop-next/tools', file)));
const { makeSandbox, launchApp, killLeftovers } = await from('done-path/harness.mjs');
const { startScriptedModel } = await from('done-path/scripted-model.mjs');
const output = path.resolve(process.argv[2]); fs.mkdirSync(output, { recursive: true });
const box = await makeSandbox(), model = await startScriptedModel(); let current;
try {
  const store = pathToFileURL(path.join(root, 'vanta-ts/src/profiles/store.ts')).href;
  execFileSync(process.execPath, ['--import', path.join(root, 'vanta-ts/node_modules/tsx/dist/loader.mjs'), '--input-type=module', '-e',
    `import {createProfile,switchProfile} from ${JSON.stringify(store)};await createProfile({name:'writer',provider:'custom',model:'done-path'});await switchProfile('writer');`],
    { env: { PATH: process.env.PATH, HOME: box.home, VANTA_HOME: box.vantaHome }, stdio: 'pipe' });
  current = await launchApp({ box, project: box.projectA, modelUrl: model.url, extraEnv: { VANTA_PROFILE: 'writer', VANTA_MODEL: 'base-profile-proof' } });
  const main = await current.app.evaluate(() => Object.fromEntries(['VANTA_HOME', 'VANTA_PROFILE_BASE_HOME', 'VANTA_PROFILE', 'VANTA_PROVIDER', 'VANTA_MODEL', 'VANTA_RUNTIME_ROOT'].map(key => [key, process.env[key]])));
  const catalog = await current.page.evaluate(() => window.desktopBridge.vanta.request({ method: 'GET', path: '/api/profiles' }));
  fs.writeFileSync(path.join(output, 'diagnostic.json'), JSON.stringify({ main, catalog, sandbox: box.root }, null, 2));
  assert.equal(catalog.data.profiles[0].provider, 'custom'); assert.equal(catalog.data.profiles[0].model, 'base-profile-proof');
} finally { await current?.app.close().catch(() => {}); await model.close(); killLeftovers(box); }
