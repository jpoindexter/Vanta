const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");

// Explicit editor strings take the pure parser branch; never launch an editor or a shell.
const root = path.resolve(process.argv[2] || process.cwd());
const caller = require.resolve("launch-editor/guess.js", { paths: [root] });
const local = createRequire(caller), quote = local("shell-quote"), guess = require(caller);
const checks = [];
for (const [input, expected] of [
  ['"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --reuse-window', ["/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code", "--reuse-window"]],
  ["code --goto 'docs/road map.md:4:2'", ["code", "--goto", "docs/road map.md:4:2"]],
  ["vim -u NONE -n", ["vim", "-u", "NONE", "-n"]],
  ['fixture-editor "" --flag="two words"', ["fixture-editor", "", "--flag=two words"]],
  ["fixture-editor escaped\\ space", ["fixture-editor", "escaped space"]],
  ["fixture-editor '$UNCHANGED'", ["fixture-editor", "$UNCHANGED"]],
  [String.raw`fixture-editor $'two\twords'`, ["fixture-editor", "two\twords"]],
  [String.raw`fixture-editor "ends-with-backslash\\" --flag`, ["fixture-editor", "ends-with-backslash\\", "--flag"]],
  [String.raw`fixture-editor "$?tail"`, ["fixture-editor", "tail"]],
  [String.raw`fixture-editor "$_suffix"`, ["fixture-editor", ""]],
]) {
  assert.deepEqual(guess(input), expected, input);
  checks.push("actual caller parse: " + input);
}
for (const tokens of [["echo", "ordinary"], ["echo", "two words", "semi;colon"], ["echo", "", "a'b"], ["echo", "line\ninside string"]]) {
  assert.deepEqual(quote.parse(quote.quote(tokens)), tokens);
  checks.push("ordinary quote/parse roundtrip");
}
for (const terminator of ["\n", "\r", "\u2028", "\u2029"]) {
  assert.throws(() => quote.quote(["echo", { comment: "fixture" }, "after" + terminator + "NOT_EXECUTED"]), TypeError);
  checks.push("reject terminator after comment");
}
console.log(JSON.stringify({ pass: true, checks: checks.length, version: local("shell-quote/package.json").version,
  caller, dependency: local.resolve("shell-quote"), limits: "Parser and advisory regression only; no native editor launch or demonstrated exploitable Vanta route" }));
