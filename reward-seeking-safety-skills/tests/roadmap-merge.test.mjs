import test from "node:test";
import assert from "node:assert/strict";

import { mergeCards } from "../scripts/apply-vanta-roadmap.mjs";

test("appends new cards without changing existing cards", () => {
  const target = { items: [{ id: "EXISTING", title: "Existing" }] };
  const result = mergeCards(target, [{ id: "NEW", title: "New" }]);
  assert.deepEqual(result.items.map((item) => item.id), ["EXISTING", "NEW"]);
  assert.equal(target.items.length, 1);
});

test("refuses duplicate roadmap IDs", () => {
  const target = { items: [{ id: "EXISTING" }] };
  assert.throws(() => mergeCards(target, [{ id: "EXISTING" }]), /already contains/);
});
