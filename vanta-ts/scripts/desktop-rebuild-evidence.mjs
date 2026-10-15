import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const destination = join(root, "vanta-ts/.artifacts/chat-first-proof");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
const lines = (value) => value.trim().split("\n").filter(Boolean);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const changed = lines(git("diff", "--name-only", "HEAD"));
const added = lines(git("ls-files", "--others", "--exclude-standard"));
const files = [...new Set([...changed, ...added])].sort();
const protectedPaths = files.filter((file) => /^(src\/|Cargo\.(toml|lock)$|MANIFESTO\.md$|vanta-ts\/src\/factory\/)/.test(file));
const forbiddenPaths = files.filter((file) => /(^|\/)(\.vanta(?:-state)?|\.env(?:\.[^/]*)?|node_modules|quarantine|hermes-agent|nightcode)(\/|$)/i.test(file));
assert.equal(protectedPaths.length, 0, `Protected changes: ${protectedPaths}`);
assert.equal(forbiddenPaths.length, 0, `Forbidden changes: ${forbiddenPaths}`);
git("diff", "--check");
let patch = git("diff", "--binary", "HEAD");
for (const file of added) {
  const check = spawnSync("git", ["diff", "--no-index", "--check", "--", "/dev/null", file], { cwd: root, encoding: "utf8" });
  assert(check.status <= 1 && !check.stdout.trim() && !check.stderr.trim(), `Whitespace check failed: ${file}`);
  const result = spawnSync("git", ["diff", "--no-index", "--binary", "--", "/dev/null", file], { cwd: root, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
  assert(result.status <= 1, `Cannot retain patch for ${file}`);
  patch += result.stdout;
}
const inventory = files.map((file) => {
  const path = join(root, file);
  if (!existsSync(path)) return { file, disposition: "deleted", sha256: null, bytes: 0 };
  const content = readFileSync(path);
  return { file, disposition: added.includes(file) ? "added" : "modified", sha256: hash(content), bytes: content.length };
});
const stats = execFileSync("git", ["apply", "--numstat"], { cwd: root, input: patch, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
const totals = lines(stats).reduce((sum, line) => {
  const [insertions, deletions] = line.split("\t");
  return { insertions: sum.insertions + (Number(insertions) || 0), deletions: sum.deletions + (Number(deletions) || 0) };
}, { insertions: 0, deletions: 0 });
const production = inventory.filter(({ file }) => /^vanta-ts\/(?:src|desktop-app\/src)\/.*\.(?:ts|tsx|css)$/.test(file) && !file.includes(".test."));
const hashFile = (file) => hash(readFileSync(join(root, file)));
const evidence = {
  branch: git("branch", "--show-current").trim(), head: git("rev-parse", "HEAD").trim(),
  changedFiles: files.length, ...totals, protectedPaths, forbiddenPaths,
  patchSha256: hash(patch), productionManifestSha256: hash(JSON.stringify(production)),
  packageSha256: hashFile("vanta-ts/release/mac-arm64/Vanta.app/Contents/Resources/app.asar"),
  packagedProofSha256: hashFile("vanta-ts/.artifacts/chat-first-proof/result.json"),
  inventory,
};
mkdirSync(destination, { recursive: true });
writeFileSync(join(destination, "proposed.patch"), patch);
writeFileSync(join(destination, "file-manifest.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ ...evidence, inventory: `${inventory.length} file entries retained in file-manifest.json` }, null, 2));
