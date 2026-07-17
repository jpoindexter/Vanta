# Desktop full-access warning

**Roadmap:** `DESKTOP-FULL-ACCESS-WARNING`
**Implemented:** 2026-07-17

## Outcome

Selecting **Full access** now presents an assertive danger banner directly above the Work composer before the operator continues. The banner states that Vanta may run commands, use the internet, and create, modify, upload, or delete project files without asking each time. It names data loss and prompt injection as material risks and states that kernel-blocked actions remain blocked.

Closing the banner dismisses only that app session. **Don't show again** stores a versioned acknowledgement for the exact project root and risk-copy version. Changing project roots, changing the material risk version, or encountering invalid stored data shows the banner again. The compact Full access control remains beside the composer after either dismissal path.

Settings > Safety reports whether the current project/version acknowledgement exists and provides **Show warning again** to remove it. This composes with the existing project-scoped approval-mode picker and kernel evaluation path; it does not create a second permission store or bypass a kernel Block decision.

## Executed proof

Executed:

```bash
npx vitest run desktop-app/src src/desktop --maxWorkers=1
npx tsc --noEmit
npx tsc -p desktop-app/tsconfig.json --noEmit
npm run vanta -- lint desktop-app/src/full-access-warning.tsx scripts/desktop-full-access-warning-smoke.mjs
npm run desktop:full-access:smoke
npm run desktop:shell-convergence:smoke
```

Observed:

- 30 desktop test files and 100 tests passed;
- core and renderer TypeScript checks passed;
- the warning component and Electron proof stayed inside Vanta's size and complexity limits;
- the production renderer built successfully;
- Electron proved the warning appears after entering Full access and the compact mode remains visible after close;
- close lasted only for the current app session;
- Don't show again survived a full Electron close and relaunch using the acknowledgement written by the first process;
- Settings > Safety reset restored the warning;
- changed project scope and stale risk-copy version invalidated acknowledgement;
- a Full access turn still displayed a kernel-blocked result;
- keyboard order reached both controls and the alert exposed `role="alert"` with assertive live semantics;
- measured title contrast was 5.38:1 in Ghost dark and 4.77:1 in Ghost light;
- the full warning and composer were visually inspected together at 760 x 900 with no clipping or panel overlap;
- the existing desktop shell-convergence smoke remained green.

The Electron proof uses deterministic loopback API fixtures so destructive operations are never performed. It executes the renderer, persistence, restart, settings, and blocked-result behavior but does not replace a physical screen-reader session.
