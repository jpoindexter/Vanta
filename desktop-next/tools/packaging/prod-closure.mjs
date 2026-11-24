// The production dependency closure of a package: every installed package reachable from its
// dependencies and optionalDependencies, resolved the way Node would (nested node_modules first, then up).
import fs from "node:fs";
import path from "node:path";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/** The directory a dependency resolves to when required from `fromDir`, or null when it is not installed. */
export function resolveInstalled(name, fromDir, stopAt) {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
    if (dir === stopAt || dir === path.dirname(dir)) return null;
  }
}

const depNames = (manifest) => [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.optionalDependencies ?? {}),
];

/**
 * Real directories of every production dependency of the package at `root`, excluding names matched by `skip`.
 * Returns [{ name, dir }] where `name` is the install name (aliases such as @typescript/native keep their alias).
 */
export function productionClosure(root, { skip = () => false } = {}) {
  const base = fs.realpathSync(root);
  const stopAt = path.dirname(fs.realpathSync(path.join(base, "node_modules")));
  const found = new Map();
  const queue = depNames(readJson(path.join(base, "package.json"))).map((name) => ({ name, from: base }));
  while (queue.length > 0) {
    const { name, from } = queue.shift();
    if (skip(name)) continue;
    const dir = resolveInstalled(name, from, stopAt);
    if (!dir || found.has(dir)) continue;
    found.set(dir, name);
    for (const child of depNames(readJson(path.join(dir, "package.json")))) queue.push({ name: child, from: dir });
  }
  return [...found].map(([dir, name]) => ({ dir, name }));
}
