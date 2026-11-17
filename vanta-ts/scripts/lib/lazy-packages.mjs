import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Heavy CommonJS packages that only a few tools need: loaded on first use, not at startup. */
export const LAZY_PACKAGES = ["typescript", "exceljs", "linkedom"];

const RUNTIME_ID = "vanta:lazy-package-runtime";
const RUNTIME_PATH = join(dirname(fileURLToPath(import.meta.url)), "lazy-package-runtime.mjs");

function importPattern(pkg) {
  return new RegExp(`^import\\s+(type\\s+)?([^;]*?)\\s+from\\s+["']${pkg.replace(/[/@.-]/g, "\\$&")}["'];?[ \\t]*$`, "gm");
}

function lazyDeclarations(clause, pkg) {
  const spec = JSON.stringify(pkg);
  const namespace = clause.match(/^\*\s+as\s+(\w+)$/);
  if (namespace) return `const ${namespace[1]} = lazyNamespace(${spec});`;
  const named = clause.match(/^\{([^}]*)\}$/);
  if (named) {
    const members = named[1].split(",").map((part) => part.trim()).filter((part) => part && !part.startsWith("type "));
    return members.map((member) => {
      const [name, alias = name] = member.split(/\s+as\s+/);
      return `const ${alias} = lazyMember(${spec}, ${JSON.stringify(name)});`;
    }).join("\n");
  }
  if (/^\w+$/.test(clause)) return `const ${clause} = lazyNamespace(${spec}, true);`;
  throw new Error(`Cannot lazy-load \`import ${clause} from "${pkg}"\`: use a namespace, default or named import.`);
}

/**
 * Replace static imports of heavy packages with lazy proxies. Types are erased by
 * esbuild afterwards, so type-position uses (`ts.Node`) still vanish cleanly.
 */
export function lazifyImports(contents, packages = LAZY_PACKAGES) {
  let changed = false;
  let out = contents;
  for (const pkg of packages) {
    out = out.replace(importPattern(pkg), (match, typeOnly, clause) => {
      if (typeOnly) return match;
      changed = true;
      return lazyDeclarations(clause.trim(), pkg);
    });
  }
  return changed ? `import { lazyNamespace, lazyMember } from "${RUNTIME_ID}";\n${out}` : contents;
}

/** Resolves the helper module that the rewritten imports pull in. */
export function lazyRuntimeResolver() {
  return {
    name: "vanta-lazy-runtime",
    setup(build) {
      build.onResolve({ filter: new RegExp(`^${RUNTIME_ID}$`) }, () => ({ path: RUNTIME_PATH }));
    },
  };
}
