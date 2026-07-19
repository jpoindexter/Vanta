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

test("the default visual tolerance still rejects changes beyond hosted-runner noise", () => {
  const expected = new PNG({ width: 100, height: 100 });
  expected.data.fill(255);
  const actual = PNG.sync.read(PNG.sync.write(expected));
  for (let index = 0; index < 120; index += 1) {
    const offset = index * 4;
    actual.data[offset] = 0;
    actual.data[offset + 1] = 0;
    actual.data[offset + 2] = 0;
  }
  const result = comparePng(PNG.sync.write(actual), PNG.sync.write(expected));
  assert.equal(result.passed, false);
  assert.equal(result.mismatchPixels, 120);
  assert.match(result.reason, /1\.200%/);
});
