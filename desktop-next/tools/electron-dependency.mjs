import { createRequire } from "node:module";
import path from "node:path";

import { workspaceTool } from "../scripts/build/frontend-common.mjs";

const next = path.resolve(import.meta.dirname, "..");

export function electronPackageRoot(source = next) {
  return path.dirname(workspaceTool(source, "apps/desktop", "electron"));
}

export function electronBinary(source = next) {
  const root = electronPackageRoot(source);
  return createRequire(path.join(root, "package.json"))(root);
}
