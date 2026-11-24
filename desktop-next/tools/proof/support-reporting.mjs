// Actual source Electron flow, isolated profile and synthetic PDF. No report transmission.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { launchVanta, waitForShell } from '../vanta-app.mjs';
import { newChat } from '../done-path/lib.mjs';
import { waitUntil } from './kit.mjs';
import { installNativeStubs, readNativeLog } from './native-stubs.mjs';

globalThis.__vantaKeepRoot = true;
const ctx = await launchVanta({ hidden: true, extraEnv: {
  VANTA_KEYCHAIN: '0', VANTA_FACTORY_DISABLED: '1', VANTA_MCP_AUTO_MOUNT: '0'
} });
console.log(`Isolated source root: ${ctx.root}`);
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
let reportRequests = 0;
try {
  await ctx.page.route('https://vanta-feedback.jason-poindexter.workers.dev/**', route => {
    reportRequests++;
    return route.abort();
  });
  await installNativeStubs(ctx, { confirm: false, downloadDir: ctx.root });
  await waitForShell(ctx.page);
  const chooseLater = ctx.page.getByRole('button', { name: "I'll choose a provider later" });
  if (await chooseLater.isVisible()) await chooseLater.click();
  await newChat(ctx.page);
  check('Unsupported legacy logsRoot is absent in the actual preload', await ctx.page.evaluate(() => !('logsRoot' in window.desktopBridge)));
  const revealed = await ctx.page.evaluate(() => window.desktopBridge.revealLogs());
  const native = await readNativeLog(ctx);
  const userData = await ctx.app.evaluate(({ app }) => app.getPath('userData'));
  fs.writeFileSync(path.join(ctx.root, 'native-reveal.json'), JSON.stringify({ userData, revealed, native }, null, 2));
  check('Native reveal targets this isolated app log, not a profile stub', revealed.ok && native.revealed[0] === revealed.path &&
    fs.realpathSync(revealed.path) === fs.realpathSync(path.join(ctx.root, 'user-data', 'logs', 'desktop.log')) &&
    fs.realpathSync(userData) === fs.realpathSync(path.join(ctx.root, 'user-data')));
  await ctx.page.locator('[data-slot="composer-root"]').first().evaluate(element => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['%PDF-1.4\nPRIVATE_CONTENT_CANARY'], 'PRIVATE_FILENAME_CANARY.pdf', { type: 'application/pdf' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await ctx.page.getByText('Could not attach PRIVATE_FILENAME_CANARY.pdf', { exact: true }).waitFor();
  check('A pathless PDF reproduces the generic failure without submitting it', true);
  await ctx.page.getByRole('button', { name: 'Send feedback', exact: true }).click();
  const dialog = ctx.page.getByRole('dialog', { name: 'Send feedback' });
  await dialog.getByLabel('In one line').fill('Synthetic PDF drop failure');
  await dialog.getByLabel('What happened').fill('A browser file could not be added.');
  await dialog.getByLabel('Steps or context (optional)').fill('1. Drop a synthetic PDF.');
  await dialog.getByRole('button', { name: 'Add diagnostic details' }).click();
  const context = await dialog.getByLabel('Steps or context (optional)').inputValue();
  check('Reviewed context identifies the actual attachment path failure', context.includes('attachment_path_unavailable'));
  check('Existing reproduction steps are retained', context.startsWith('1. Drop a synthetic PDF.'));
  check('Diagnostic context excludes file names and content', !/PRIVATE_FILENAME_CANARY|PRIVATE_CONTENT_CANARY/.test(context));
  await ctx.resize(600, 650);
  await dialog.getByRole('button', { name: 'Save report', exact: true }).scrollIntoViewIfNeeded();
  const saveBounds = await dialog.getByRole('button', { name: 'Save report', exact: true }).boundingBox();
  const viewport = await ctx.page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  check('Report controls remain reachable in a narrow short window', saveBounds && saveBounds.x >= 0 && saveBounds.y >= 0 &&
    saveBounds.x + saveBounds.width <= viewport.width && saveBounds.y + saveBounds.height <= viewport.height);
  fs.writeFileSync(path.join(ctx.root, 'reviewed-context.json'), JSON.stringify({ context }));
  await dialog.getByRole('button', { name: 'Save report', exact: true }).click();
  // Electron writes the download without Playwright emitting Page.download on this build.
  const exportPath = path.join(ctx.root, 'Vanta-feedback.json');
  const exported = await waitUntil(() => {
    try { return JSON.parse(fs.readFileSync(exportPath, 'utf8')); } catch { return false; }
  }, 10_000, 100);
  check('Actual downloaded JSON matches the reviewed context', exported.steps === context && exported.title === 'Synthetic PDF drop failure');
  await ctx.page.keyboard.press('Escape');
  await ctx.page.reload();
  await waitForShell(ctx.page);
  await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('desktop:feedback-requested'));
  await dialog.waitFor();
  check('The unsent report context survives renderer reload', await dialog.getByLabel('Steps or context (optional)').inputValue() === context);
  check('No feedback network request was made', reportRequests === 0);
  check('No renderer errors were captured', ctx.errors.length === 0);
  const receipt = { checks, root: ctx.root, reportRequests, rendererErrors: ctx.errors, limits: ['source app, not signed installed release', 'Finder/native Save panel substituted at OS edge', 'synthetic PDF, not original tester incident', 'no support inbox send'] };
  fs.writeFileSync(path.join(ctx.root, 'support-reporting.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
} finally {
  await ctx.close();
}
