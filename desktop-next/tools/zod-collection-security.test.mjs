import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const { z } = require("zod");

test("bounded arrays reject excess elements before invoking their parser", () => {
  let elementParses = 0;
  const schema = z.array(z.string().transform(value => {
    elementParses++;
    return value.toUpperCase();
  })).max(1);
  const oversized = schema.safeParse(Array(8).fill("safe"));
  assert.equal(oversized.success, false);
  assert.equal(oversized.error.issues[0].code, "too_big");
  assert.equal(elementParses, 0);
  assert.deepEqual(schema.parse(["safe"]), ["SAFE"]);
  assert.equal(elementParses, 1);
});
