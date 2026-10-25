import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { startScriptedModel } from "./scripted-model.mjs";

test("loopback receipt preserves exact text and hashes actual image bytes without retaining the image body", async () => {
  const model = await startScriptedModel();
  const bytes = Buffer.from([0, 1, 2, 3, 4]);
  try {
    const reply = await fetch(`${model.url}/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: [
        { type: "text", text: "Keep exact text." },
        { type: "image_url", image_url: { url: `data:image/png;base64,${bytes.toString("base64")}` } }
      ] }] })
    });
    assert.equal(reply.status, 200);
    await reply.json();
    assert.equal(model.requests.length, 1);
    const receipt = model.requests[0];
    assert.equal(receipt.prompt, "Keep exact text.");
    assert.deepEqual(receipt.imageHashes, [createHash("sha256").update(bytes).digest("hex")]);
    assert.equal(JSON.stringify(receipt).includes(bytes.toString("base64")), false);
  } finally { await model.close(); }
});
