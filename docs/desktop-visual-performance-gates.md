# Desktop visual and performance gates

Vanta's desktop release proof includes two deterministic regression boundaries on macOS ARM64.

## Visual proof

`npm run desktop:visual:proof` exercises the real desktop shell and compares 36 screenshots: Work, approval, recovery, model picker, Connect, and bulk session selection at 1440, 1024, and 760 pixels in Ghost dark and Ghost light.

Baselines live in `vanta-ts/scripts/fixtures/desktop-visual-baselines/darwin-arm64`. A screenshot may change by at most 1% of its pixels; a failure writes the actual image and a highlighted pixel diff to `vanta-ts/.vanta/desktop-visual-diffs`.

Only run `npm run desktop:visual:update` after reviewing the UI change at all widths and both themes. Baseline updates are product changes and belong in the same review as the implementation.

## Performance proof

`npm run desktop:performance:proof` packages and launches the app, performs a first task, and measures:

- cold start to a usable shell;
- first instruction to visible output;
- idle process-tree memory;
- active process-tree CPU;
- `app.asar` bytes;
- unpacked resource bytes;
- installed bundle disk usage with hard links deduplicated.

Budgets live in `vanta-ts/scripts/fixtures/desktop-performance-budgets.json`. Each metric must remain below both its percentage regression allowance and its absolute maximum. `npm run desktop:performance:update` records a reviewed local baseline without changing the hard limits.

The macOS ARM64 cold-start baseline is 5.5 seconds. The regression check uses the median of three fresh-profile launches, while every individual sample must remain under the separate 10-second hard ceiling. It is calibrated from fresh signed-package measurements across the release Mac and GitHub's clean hosted runner, isolating normal process-launch variance without weakening the first-use, memory, CPU, or package-size budgets.

The comparator self-tests intentionally mutate one screenshot and breach one performance budget. Both must fail with the affected file or metric, observed value, and allowed limit.
