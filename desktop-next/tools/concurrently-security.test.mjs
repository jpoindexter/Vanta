import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const packagePath = require.resolve("concurrently/package.json");
const commandRequire = createRequire(packagePath);
const { quote } = commandRequire("shell-quote");

test("shell quoting rejects a line break after a comment without executing it", () => {
  assert.throws(() => quote(["echo", "ok", { comment: "x" }, "a\nid;#"]), TypeError);
  assert.equal(quote(["echo", "ordinary argument"]), "echo 'ordinary argument'");
});

test("the installed concurrently CLI still runs both harmless commands", () => {
  const command = label => `${JSON.stringify(process.execPath)} -e ${JSON.stringify(`process.stdout.write('${label}')`)}`;
  const output = execFileSync(process.execPath, [
    path.join(path.dirname(packagePath), "dist/bin/index.js"),
    "--raw", "--success", "all", command("first-proof"), command("second-proof"),
  ], { encoding: "utf8", timeout: 10_000 });
  assert.ok(output.includes("first-proof") && output.includes("second-proof"));
});
