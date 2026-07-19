import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import { comparePng } from "./desktop-visual-regression.mjs";

function image(changed = false) {
  const png = new PNG({ width: 4, height: 4 });
  png.data.fill(255);
  if (changed) {
    png.data[0] = 0;
    png.data[1] = 0;
    png.data[2] = 0;
  }
  return PNG.sync.write(png);
}

test("identical visual baselines pass", () => {
  const result = comparePng(image(), image(), { maxMismatchRatio: 0 });
  assert.equal(result.passed, true);
  assert.equal(result.mismatchPixels, 0);
});

test("an intentional visual mutation fails with a useful diff", () => {
  const result = comparePng(image(true), image(), { maxMismatchRatio: 0 });
  assert.equal(result.passed, false);
  assert.equal(result.mismatchPixels, 1);
  assert.match(result.reason, /1 pixels changed/);
  assert.ok(result.diff?.length);
});
