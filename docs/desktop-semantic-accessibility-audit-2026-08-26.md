# Desktop Semantic Foundation and Accessibility Audit

Date: 2026-08-26

Implementation commit: `440af81a8deb0786c1a14e0a26208d0227f8fb2f`

Base commit: `d96f531f23a57ebdea9b82b1d08361cf18d4dbf3`

Branch: `codex/desktop-semantic-accessibility-20260826`

## Verdict

The bounded Desktop semantic-foundation and approval-accessibility implementation is locally green. This evidence does not merge, release, deploy, notarize, or claim that every inherited Desktop source file satisfies the repository size gate.

## Before and after

| Criterion | Before | After |
| --- | ---: | ---: |
| CSS semantic token authorities | 3 | 1 |
| Supported visual surfaces | 7 captured by the source flow, with orphaned Connect baselines | 8 registered and captured |
| Visual baseline images | 48 without exact route ownership | 48 with exact missing/orphan guard |
| Serious accessibility findings on the approval replay | 10 | 0 |
| Consequential metadata minimum | below 12px | 12px |
| Consequential compact-control minimum | 30–34px | 36px |
| Approval keyboard focus | inconsistent | 2px solid visible ring |
| Runtime/transcript grid | two declared rows for three children | explicit `auto / minmax(0, 1fr) / auto` |
| Shared primitives | select only | button, field, loader, error, confirmation actions, and select |

The original baseline proof initially failed before the scan because the command built only a release kernel while the source replay required the debug kernel. After that harness defect was corrected, the real scan exposed ten contrast failures across runtime metadata, timeline metadata, and approval labels. Those failures were corrected rather than waived.

## Implemented behavior

- `desktop-app/src/design/tokens.css` is the sole dark/light semantic authority and exposes surface, text, border, accent, state, spacing, typography, control-height, focus, elevation, and motion variables.
- Legacy variable names remain aliases to the semantic authority so existing components do not fork the palette.
- Consequential approval/runtime metadata uses a 12px minimum; consequential approval/model controls use a 36px minimum.
- Approval and runtime states retain textual labels in addition to color.
- Shared primitives are used by setup, loading, overlay approval, and inline approval paths.
- The compact runtime strip no longer overlaps the transcript; the visual harness now rejects that layout regression.
- Connect is captured by the source flow, and the registered surface matrix rejects missing or orphaned baselines.
- The VoiceOver replay uses the current `Review` dialog names and checks the actual source tree rather than a nonexistent nested path.

## Executed local gates

| Command | Exit | Executed evidence |
| --- | ---: | --- |
| `npm ci` | 0 | 657 lockfile packages installed; npm audit reported 0 vulnerabilities. This replaced a worktree-only dependency symlink that Electron Builder could not package correctly. |
| `npm run typecheck` | 0 | Runtime TypeScript typecheck passed. |
| `npm run desktop:renderer:typecheck` | 0 | Desktop renderer TypeScript typecheck passed. |
| `npx vitest run desktop-app/src/form-controls.test.tsx desktop-app/src/overlays.test.tsx desktop-app/src/chat.test.tsx desktop-app/src/runtime-strip.test.tsx` | 0 | 4 files, 25 tests passed. |
| `node --test scripts/lib/desktop-visual-regression.node-test.mjs` | 0 | 4 tests passed, including intentional-mutation rejection and exact surface/baseline ownership. |
| `npm run desktop:visual:update` | 0 | 48 baselines regenerated intentionally after the semantic and grid corrections. |
| `npm run desktop:visual:proof` | 0 | 48 source captures matched across 8 surfaces, 2 themes, and 3 viewports; compact runtime/transcript overlap guard passed. |
| `npm run desktop:accessibility:proof` | 0 | Canonical aggregate passed for source and signed packaged app. Each target replayed 8 shell surfaces plus queue with zero serious findings. Metadata measured 12px; controls 36px; focus 2px solid; reduced-motion duration 0.00001s. Packaged bulk deletion completed in 320ms. |
| `npm run desktop:voiceover:proof` | 0 | Exact implementation commit replayed keyboard-only attachment, Review navigation, allow-once approval, and result; pointer events: 0; `packagedSourceClean: true`. |
| `scripts/secret-scan` | 0 | 2,170 commits and 21.49MB current repository-owned snapshot scanned; zero leaks. |
| `git diff --check` | 0 | No whitespace errors. |
| protected/forbidden-content path scan | 0 | No Rust source, protected factory, `MANIFESTO.md`, Hermes, Nightcode, `.vanta`, or quarantine content in the implementation commit. |

One aggregate accessibility attempt observed a 2.317s packaged bulk-delete timing against the 2s budget while the source result was 318ms. An immediate unchanged packaged replay measured 315ms, and the final canonical aggregate measured 320ms. No timing threshold was relaxed.

## Retained artifacts

The ignored local artifacts are evidence, not repository content:

- VoiceOver video: `.vanta/accessibility-proof/desktop-voiceover-proof.mov`
  - bytes: `20,255,539`
  - SHA-256: `3c204b27fe6304676027c39bc393ccea383adf6998caa25187d0c0967243b25e`
- VoiceOver receipt: `.vanta/accessibility-proof/desktop-voiceover-proof.json`
  - bytes: `2,206`
  - SHA-256: `661bda0f57e73c9a63722ebb8134a68b7be91d2b0896b2ded996ddc1faf57efc`
- Sorted 48-image baseline hash manifest SHA-256: `75a1b33a514beffe878e3168ec30d15278f81fc75900681051efe0400b33836c`

The retained VoiceOver receipt binds to `440af81a8deb0786c1a14e0a26208d0227f8fb2f` and the packaged executable under this isolated worktree.

## Honest boundaries and remaining debt

- The repository size hook reports 19 inherited violations across five files, including `App.tsx`, `chat.tsx`, and `overlays.tsx`. This card adds small primitive imports/usages there but does not perform the separate behavior-risk module split. The commit used the hook's documented warn-only mode; architectural-boundary and secret gates still passed.
- A broad static inventory still finds 30 literal-color candidates outside the token authority, 174 sub-12px font declarations, and 181 sub-36px width/height declarations. These include decorative icons, dense non-consequential metadata, and legacy surfaces; this audit does not claim global eradication.
- Pixel comparison proves stability against the accepted images, not subjective visual quality. The dark compact and standard approval surfaces were also inspected manually after the grid correction.
- GitHub Actions remain disabled. All evidence here is local and does not establish merged-main, release, deployment, notarization, or external-user outcomes.
- The separate roadmap projection worktree remains user-owned and unchanged by this implementation. Card-status reconciliation must happen through canonical `roadmap.json` and its generator, not by hand-editing projections here.

## Done criterion ledger

- Executed: one semantic token authority.
- Executed: zero serious accessibility findings on the source and packaged approval/shell/queue paths.
- Executed: 12px consequential metadata, 36px consequential controls, visible focus, textual state, and reduced motion.
- Executed: exact 48-image route matrix with no missing or orphaned baselines.
- Executed: keyboard-only VoiceOver path in the packaged app with zero pointer input.
- Not established: whole-repository size compliance, merged-main state, release, deployment, or user-testing outcomes.
