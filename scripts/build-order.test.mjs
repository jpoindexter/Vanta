import assert from "node:assert/strict";
import test from "node:test";
import { buildOrderDocument } from "./build-order.mjs";

test("build order follows the current authority and does not invent git authorization", () => {
  const output = buildOrderDocument({
    updated: "2026-07-31",
    items: [
      {
        id: "TRUST-02",
        status: "building",
        track: "Harness",
        tier: "rock",
        size: "L",
        effort: "high",
        model: "opus",
        title: "Trust closure",
        summary: "Close the trust gap.",
        done: "The real path passes.",
      },
    ],
  });

  assert.match(output, /one product with Vanta, Engine, and Lab boundaries/i);
  assert.match(output, /Do not commit or push unless/i);
  assert.doesNotMatch(output, /commit the slice/i);
  assert.doesNotMatch(output, /5 pillars/i);
  assert.doesNotMatch(output, /quarry/i);
});
