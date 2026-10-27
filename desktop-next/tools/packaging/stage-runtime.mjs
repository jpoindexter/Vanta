// Stages the Vanta runtime as real files for Resources/vanta-runtime: the precompiled bundle, the source tree
// the bundle reads assets from, the legacy renderer the server can serve, and the production node_modules.
// Nothing here is a symlink and nothing points outside the staged folder.
import fs from "node:fs";
import path from "node:path";

import { productionClosure } from "./prod-closure.mjs";

// Packages the old desktop packaging also left out: renderer-only or optional ML/image stacks the runtime never loads.
const SKIPPED_PACKAGES = /^(@huggingface|@img|adm-zip|global-agent|onnxruntime|lucide-react|sharp)(\/|-|$)/;
const TEST_FILE = /(?:\.test|\.node-test)\.(ts|tsx|mjs)$/;

const copyTree = (from, to, filter) =>
  fs.cpSync(from, to, { recursive: true, dereference: true, filter });

/** Copies a package directory; dangling links and .bin shims are dropped, symlinks to files are copied as files. */
function copyPackage(from, to) {
  copyTree(from, to, (source) => {
    if (path.basename(source) === ".bin") return false;
    try {
      fs.statSync(source);
      return true;
    } catch {
      return false;
    }
  });
}

/** Where a closure entry lands under node_modules, keeping nested versions nested. */
const relativeInstall = (nodeModulesRoot, dir) => {
  const rel = path.relative(nodeModulesRoot, dir);
  if (rel.startsWith("..")) throw new Error(`Dependency ${dir} is outside ${nodeModulesRoot}; refusing to package it.`);
  return rel;
};

export function stageRuntime({ vantaTs, dest }) {
  const root = fs.realpathSync(vantaTs);
  const bundle = path.join(root, "dist-runtime", "cli.mjs");
  if (!fs.existsSync(bundle)) throw new Error(`No runtime bundle at ${bundle}. Run: npm run desktop:runtime (in vanta-ts).`);

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  copyTree(path.join(root, "dist-runtime"), path.join(dest, "dist-runtime"));
  copyTree(path.join(root, "src"), path.join(dest, "src"), (source) => !TEST_FILE.test(source));
  copyTree(path.join(root, "desktop-native"), path.join(dest, "desktop-native"), (source) => !TEST_FILE.test(source));
  fs.mkdirSync(path.join(dest, "desktop-app"), { recursive: true });
  copyTree(path.join(root, "desktop-app", "dist"), path.join(dest, "desktop-app", "dist"));
  fs.copyFileSync(path.join(root, "package.json"), path.join(dest, "package.json"));

  const nodeModules = fs.realpathSync(path.join(root, "node_modules"));
  const closure = productionClosure(root, { skip: (name) => SKIPPED_PACKAGES.test(name) });
  for (const { dir } of closure) copyPackage(dir, path.join(dest, "node_modules", relativeInstall(nodeModules, dir)));
  return { packages: closure.length };
}
