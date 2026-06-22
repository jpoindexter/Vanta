<!-- Thanks for contributing to Vanta! Keep this PR focused on one change. -->

## What & why

Briefly: what does this change, and why?

Closes #

## Checklist

- [ ] Tests added/updated and passing — `cargo test` (kernel) and `cd vanta-ts && npm test`
- [ ] `cd vanta-ts && npm run typecheck` is clean
- [ ] Size gate passes (`npx vanta lint --staged`): files ≤300, fns ≤50, params ≤4, cx ≤10
- [ ] Conventional commit messages (`feat:` / `fix:` / `chore:` / `docs:` / `refactor:`)
- [ ] No secrets committed; new env keys documented in `.env.example`
- [ ] Docs updated if behavior/commands/flags changed
- [ ] The kernel boundary is preserved (no path that bypasses `assess()`)
