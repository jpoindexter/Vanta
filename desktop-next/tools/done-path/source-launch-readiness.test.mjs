import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { assertSourceLaunchReady } from './harness.mjs';

test('a renderer-only build fails before launching Electron when native entries are missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vanta-launch-preflight-'));
  try {
    fs.mkdirSync(path.join(root, 'dist'));
    fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<main>renderer</main>');
    assert.throws(() => assertSourceLaunchReady(root), /vanta:build/);
    fs.writeFileSync(path.join(root, 'dist', 'electron-main.mjs'), '// fixture');
    assert.throws(() => assertSourceLaunchReady(root), /preload/);
    fs.writeFileSync(path.join(root, 'dist', 'electron-preload.js'), '// fixture');
    assert.doesNotThrow(() => assertSourceLaunchReady(root));
  } finally { fs.rmSync(root, { recursive: true }); }
});
