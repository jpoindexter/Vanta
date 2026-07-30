# Repository Guidelines

## Project Structure & Module Organization

This repository is a focused Vanta desktop workbench snapshot, not the complete
application checkout. Keep root-level patches (`*.patch`) and
`vanta-desktop-demo.html` as review/demo artifacts.

- `staging/vanta-ts/src/` contains TypeScript runtime code. Provider adapters
  live in `src/providers/`; terminal behavior lives in `src/term/`.
- `staging/vanta-ts/desktop-app/src/` contains the React desktop UI. Keep UI
  state in `state.ts`, shared types in `types.ts`, and styles in `styles.css`.
- `staging/vanta-ts/scripts/` contains focused smoke checks.
- `staging/docs/` and `staging/vanta-website/docs/` contain product and UX
  decisions; update them when behavior or interaction rules change.

## Build, Test, and Development Commands

This snapshot has no `package.json`, lockfile, or local dependency tree. Do not
invent build commands or add generated dependencies here. In a full Vanta
checkout, run commands from `vanta-ts/`:

```bash
npm run desktop:native     # build and launch the desktop app
npm run desktop:dist       # produce a local macOS distribution
node scripts/desktop-layout-smoke.mjs  # run the desktop layout smoke check
```

Run the narrowest relevant test first. Existing TypeScript tests are colocated
with their code, for example `src/providers/index.test.ts` and
`desktop-app/src/overlays.test.tsx`.

## Coding Style & Naming Conventions

Use TypeScript and React with two-space indentation, semicolons, double-quoted
string literals, and explicit exported types for shared boundaries. Name React
components in `PascalCase`; use `camelCase` for functions, variables, and hooks;
and use kebab-case for documentation files. Keep provider-specific logic inside
`src/providers/`, not in UI components. Preserve the existing accessibility
pattern: interactive controls need clear labels and keyboard behavior.

## Testing Guidelines

Add a colocated `*.test.ts` or `*.test.tsx` file for behavior changes. Cover the
user-visible path plus failure/empty states, particularly provider auth, model
selection, layouts, and approval flows. Record any manual desktop check in the
relevant staging document; a passing unit test alone does not validate Electron
or macOS behavior.

## Commit & Pull Request Guidelines

No Git history is available in this snapshot, so use concise imperative commits,
such as `fix desktop model picker overflow`. Keep each commit scoped. Pull
requests should state the behavior change, tests run, and remaining gaps; attach
screenshots for desktop UI changes and link the relevant issue or roadmap item.

## Security & Configuration

Never commit `.env` files, API keys, OAuth tokens, or local Vanta state. Keep
credentials in ignored local configuration and ensure logs, patches, and
screenshots do not expose them.
