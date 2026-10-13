import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { build } from "esbuild";
import { lazifyImports, lazyRuntimeResolver } from "./lazy-packages.mjs";

export const BUNDLE_DIR = "dist-runtime";
export const BUNDLE_ENTRY = "cli.mjs";

/**
 * Source modules locate sibling assets (wasm, python helpers, skill libraries)
 * through import.meta.url. Once bundled, that URL would name the bundle, so each
 * reference is pinned to the module's original location under the app root.
 */
export function rewriteSourceUrls(contents, relPath) {
  if (!contents.includes("import.meta.url")) return contents;
  return contents.replaceAll("import.meta.url", `__vantaSourceUrl(${JSON.stringify(relPath)})`);
}

export const SOURCE_URL_BANNER =
  'const __vantaSourceUrl = (rel) => new URL("../" + rel, import.meta.url).href;';

function sourceTransformPlugin(root, lazyPackages) {
  // esbuild reports real paths; a symlinked root (macOS tmpdir, worktrees) must match them.
  const realRoot = realpathSync(root);
  return {
    name: "vanta-source-transform",
    setup(b) {
      b.onLoad({ filter: /\.(ts|tsx)$/ }, async (args) => {
        const rel = relative(realRoot, args.path).split("\\").join("/");
        if (rel.startsWith("..") || rel.includes("node_modules")) return undefined;
        const contents = await readFile(args.path, "utf8");
        const rewritten = lazifyImports(rewriteSourceUrls(contents, rel), lazyPackages);
        if (rewritten === contents) return undefined;
        return { contents: rewritten, loader: args.path.endsWith("x") ? "tsx" : "ts" };
      });
    },
  };
}

/** Bundle the CLI to ESM with code splitting; npm packages stay external. */
export async function buildRuntimeBundle(options = {}) {
  const root = resolve(options.root ?? ".");
  const outdir = resolve(root, options.outDir ?? BUNDLE_DIR);
  const sourcemap = options.sourcemap ? "linked" : false;
  const result = await build({
    absWorkingDir: root,
    entryPoints: options.entries ?? { cli: join(root, "src", "cli.ts") },
    outdir,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "node",
    target: "node22",
    packages: "external",
    sourcemap,
    minify: false,
    logLevel: "silent",
    metafile: true,
    banner: { js: SOURCE_URL_BANNER },
    plugins: [lazyRuntimeResolver(), sourceTransformPlugin(root, options.lazyPackages)],
  });
  return { outdir, entry: join(outdir, BUNDLE_ENTRY), metafile: result.metafile };
}
