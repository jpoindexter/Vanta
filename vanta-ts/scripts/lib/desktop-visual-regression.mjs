import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export const VISUAL_VIEWPORTS = [
  { name: "wide", width: 1440, height: 960 },
  { name: "standard", width: 1024, height: 720 },
  { name: "compact", width: 760, height: 700 },
];

export const VISUAL_THEMES = ["dark", "light"];

export function comparePng(actualBuffer, expectedBuffer, options = {}) {
  const actual = PNG.sync.read(actualBuffer);
  const expected = PNG.sync.read(expectedBuffer);
  if (actual.width !== expected.width || actual.height !== expected.height) {
    return {
      passed: false,
      mismatchPixels: actual.width * actual.height,
      mismatchRatio: 1,
      reason: `dimensions differ: expected ${expected.width}x${expected.height}, received ${actual.width}x${actual.height}`,
    };
  }
  const diff = new PNG({ width: actual.width, height: actual.height });
  const mismatchPixels = pixelmatch(actual.data, expected.data, diff.data, actual.width, actual.height, {
    threshold: options.pixelThreshold ?? 0.12,
    includeAA: false,
  });
  const mismatchRatio = mismatchPixels / (actual.width * actual.height);
  // Electron text anti-aliasing and live runtime metrics vary slightly between
  // local and hosted Apple Silicon runners. Keep the tolerance narrow enough
  // that layout or component regressions still fail.
  const maxMismatchRatio = options.maxMismatchRatio ?? 0.011;
  return {
    passed: mismatchRatio <= maxMismatchRatio,
    mismatchPixels,
    mismatchRatio,
    maxMismatchRatio,
    diff: PNG.sync.write(diff),
    reason: `${mismatchPixels} pixels changed (${(mismatchRatio * 100).toFixed(3)}%; limit ${(maxMismatchRatio * 100).toFixed(3)}%)`,
  };
}

export async function captureVisualMatrix(page, surface, options) {
  const originalViewport = page.viewportSize();
  const originalTheme = await page.locator(".app-shell").evaluate((shell) => shell.classList.contains("theme-light") ? "light" : "dark");
  const results = [];
  try {
    for (const theme of VISUAL_THEMES) {
      await page.locator(".app-shell").evaluate((shell, nextTheme) => {
        shell.classList.toggle("theme-light", nextTheme === "light");
        shell.classList.toggle("theme-dark", nextTheme === "dark");
      }, theme);
      for (const viewport of VISUAL_VIEWPORTS) {
        await page.setViewportSize(viewport);
        await settle(page);
        const name = `${surface}-${theme}-${viewport.name}.png`;
        const baselinePath = join(options.baselineRoot, name);
        const actual = await page.screenshot({ animations: "disabled", fullPage: false });
        if (options.update) {
          await mkdir(dirname(baselinePath), { recursive: true });
          await writeFile(baselinePath, actual);
          results.push({ name, updated: true });
          continue;
        }
        let expected;
        try {
          expected = await readFile(baselinePath);
        } catch {
          throw new Error(`Missing visual baseline ${baselinePath}. Run npm run desktop:visual:update intentionally.`);
        }
        const comparison = comparePng(actual, expected, options);
        if (!comparison.passed) {
          const artifactRoot = options.artifactRoot ?? join(process.cwd(), ".vanta", "desktop-visual-diffs");
          await mkdir(artifactRoot, { recursive: true });
          const actualPath = join(artifactRoot, name.replace(/\.png$/, "-actual.png"));
          const diffPath = join(artifactRoot, name.replace(/\.png$/, "-diff.png"));
          await writeFile(actualPath, actual);
          if (comparison.diff) await writeFile(diffPath, comparison.diff);
          throw new Error(`Visual regression in ${name}: ${comparison.reason}. Actual: ${actualPath}. Diff: ${diffPath}.`);
        }
        results.push({ name, ...comparison, diff: undefined });
      }
    }
  } finally {
    await page.locator(".app-shell").evaluate((shell, theme) => {
      shell.classList.toggle("theme-light", theme === "light");
      shell.classList.toggle("theme-dark", theme === "dark");
    }, originalTheme);
    if (originalViewport) await page.setViewportSize(originalViewport);
    await settle(page);
  }
  return results;
}

async function settle(page) {
  await page.mouse.move(1, 1);
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.documentElement.style.caretColor = "transparent";
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
