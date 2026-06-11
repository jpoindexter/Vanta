# Vendored: @hermes/ink

Forked Ink renderer from NousResearch/hermes-agent
(`ui-tui/packages/hermes-ink`), vendored 2026-06-11 and aliased as `ink` in
vanta-ts/package.json. MIT licensed (see LICENSE in this directory).

Why: line-based ScrollBox scrolling, AlternateScreen with native mouse-wheel
tracking, and a keypress parser that turns SGR mouse reports into
wheelUp/wheelDown key events — the scrolling architecture Vanta's TUI now uses.

Build (dist/ is committed; rebuild only after editing src/):

    npx esbuild src/entry-exports.ts --bundle --platform=node --format=esm \
      --packages=external --outdir=dist

Local changes vs upstream:
- `types` removed from package.json and index.d.ts/text-input.d.ts renamed to
  *.upstream — the shipped declarations re-export .ts source paths tsc cannot
  follow from node_modules; Vanta types the surface it uses in
  src/types/ink.d.ts instead (same approach as upstream's own consumer).
- Version set to 7.0.5 so ink-text-input's `ink>=5` peer range resolves.
