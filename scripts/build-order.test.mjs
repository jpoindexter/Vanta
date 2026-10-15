import assert from "node:assert/strict";
import test from "node:test";
import { buildOrderDocument, openItems, validateRoadmapGraph } from "./build-order.mjs";

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

test("canonical graph validation rejects duplicate, missing, self, and cyclic dependencies", () => {
  const item = (id, after = []) => ({
    id,
    after,
    status: "next",
    track: "Harness",
    tier: "rock",
    size: "S",
    effort: "low",
    title: id,
    summary: `${id} summary`,
    done: `${id} done`,
  });

  assert.throws(() => validateRoadmapGraph({ items: [item("A"), item("a")] }), /duplicate roadmap ID: a/);
  assert.throws(() => validateRoadmapGraph({ items: [item("A", ["B"])] }), /A: missing dependency B/);
  assert.throws(() => validateRoadmapGraph({ items: [item("A", ["A"])] }), /A: self-dependency/);
  assert.throws(
    () => validateRoadmapGraph({ items: [item("A", ["B"]), item("B", ["A"])] }),
    /roadmap dependency cycle: A -> B -> A/,
  );
});

test("shared open ordering includes Desktop App and keeps dependencies first", () => {
  const item = (id, track, after = []) => ({
    id, track, after, status: "next", tier: "rock", size: "S", effort: "low",
    title: id, summary: `${id} summary`, done: `${id} done`,
  });
  const roadmap = {
    updated: "2026-09-03",
    items: [
      item("DESKTOP", "Desktop App"),
      item("OPERATOR", "Operator", ["DESKTOP"]),
      item("HARNESS", "Harness"),
    ],
  };

  assert.deepEqual(openItems(roadmap).map((entry) => entry.id), ["HARNESS", "DESKTOP", "OPERATOR"]);
  const output = buildOrderDocument(roadmap);
  assert.match(output, /- open_cards: 3/);
  assert.match(output, /- Harness: 1 open/);
  assert.match(output, /- Operator: 1 open/);
  assert.match(output, /- Desktop App: 1 open/);
});

test("open ordering remains dependency-correct beyond ten links", () => {
  const items = Array.from({ length: 16 }, (_, index) => ({
    id: `CHAIN-${index}`,
    track: "Harness",
    status: index === 15 ? "next" : "horizon",
    tier: index === 15 ? "rock" : "sand",
    size: "S",
    effort: "low",
    title: `Chain ${index}`,
    summary: `Chain ${index} summary`,
    done: `Chain ${index} done`,
    after: index === 0 ? [] : [`CHAIN-${index - 1}`],
  })).reverse();

  assert.deepEqual(
    openItems({ updated: "2026-09-03", items }).map((item) => item.id),
    Array.from({ length: 16 }, (_, index) => `CHAIN-${index}`),
  );
});
