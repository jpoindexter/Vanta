import assert from "node:assert/strict";
import { test } from "node:test";

const names = ["fetch", "Headers", "Request", "Response", "FormData"];
const preserved = ["WebSocket", "EventSource", "CloseEvent", "ErrorEvent", "MessageEvent"];
const snapshot = (keys) => keys.map((key) => [key, globalThis[key]]);
const unchanged = (entries) => entries.forEach(([key, value]) => assert.equal(globalThis[key], value, key));

test("maintained imports are named-global neutral; initialization changes only Fetch family", async () => {
  const before = snapshot([...names, ...preserved]);
  const maintained = await import("./maintained-fetch.mjs");
  unchanged(before);
  const { fetch: implementation, Headers, Request, Response, FormData } = await import("undici");
  assert.equal(maintained.maintainedFetch, implementation);
  assert.deepEqual(maintained.fetchGlobals, { fetch: implementation, Headers, Request, Response, FormData });
  await import("./runtime-fetch-init.mjs");
  for (const name of names) assert.equal(globalThis[name], maintained.fetchGlobals[name], name);
  unchanged(before.filter(([key]) => preserved.includes(key)));
  const form = new FormData();
  form.set("field", "tiny");
  const request = new Request("https://example.invalid/", { method: "POST", body: form });
  assert(request.headers instanceof Headers);
  assert.equal((await request.formData()).get("field"), "tiny");
  const response = new Response("tiny", { headers: { "x-proof": "yes" } });
  assert(response.headers instanceof Headers);
  assert.equal(await response.clone().text(), "tiny");
  assert.equal(await response.text(), "tiny");
});
