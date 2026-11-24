import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("Express's patched query parser retains nested inputs and handles hostile comma-array values", () => {
  const qs = createRequire(require.resolve("express"))("qs");
  assert.deepEqual(qs.parse("a[b]=c&values[]=1&values[]=2"), { a: { b: "c" }, values: ["1", "2"] });
  assert.doesNotThrow(() => qs.stringify({ values: [{ toString: 1 }] }, { arrayFormat: "comma" }));
});

for (const consumer of ["copy-webpack-plugin", "css-minimizer-webpack-plugin"]) {
  test(`${consumer} serializer escapes a closing tag at the end of a function`, () => {
    const serialize = createRequire(require.resolve(consumer))("serialize-javascript");
    function f() {}
    function g() {}
    f.toString = () => "function f(){ return 1 }//</script";
    g.toString = () => "function g(x){ return x } > <img src=x onerror=alert(1)>";
    assert.doesNotMatch(serialize({ a: { f }, g }, { space: 2 }), /<\/script/i);
    assert.equal(serialize({ text: "safe", count: 3 }), '{"text":"safe","count":3}');
  });
}

test("Mermaid's patched math dependency keeps equations and ignores inherited trust", () => {
  const mermaid = createRequire(require.resolve("@docusaurus/theme-mermaid"));
  const katex = createRequire(mermaid.resolve("mermaid"))("katex");
  assert.match(katex.renderToString(String.raw`\frac{a}{b}`), /class="katex"/);
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "trust");
  Object.defineProperty(Object.prototype, "trust", { value: true, configurable: true, writable: true });
  try {
    const html = katex.renderToString(String.raw`\href{https://example.invalid/inherited-trust}{control}`, { throwOnError: false });
    assert.doesNotMatch(html, /href="https:\/\/example\.invalid\/inherited-trust"/);
  } finally {
    if (previous) Object.defineProperty(Object.prototype, "trust", previous);
    else Reflect.deleteProperty(Object.prototype, "trust");
  }
});
