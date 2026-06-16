---
name: source-grounded
description: Ground framework- and library-specific code in official documentation, not training data. Detect the installed version, fetch the relevant doc page, implement to the documented pattern, cite the source with a deep link, and flag anything you could not verify. Use when correctness depends on a specific framework or library version (routing, data fetching, forms, auth, state, build config).
---
# Source-Grounded

Training data goes stale, APIs deprecate, and "looks right" ships a pattern that broke two versions ago. Before writing framework-specific code from memory, verify it against the official docs for the *installed* version and cite the source so the user can check it. Version-agnostic logic — loops, data structures, renames, file moves — is exempt; this is for the version-dependent surface where the wrong pattern compiles and then bites.

## Steps

1. **Detect the stack + versions.** Read the dependency manifest, don't guess: `package.json` · `pyproject.toml` / `requirements.txt` · `go.mod` · `Cargo.toml` · `composer.json` · `Gemfile`. State what you found — `React 19.1.0, Vite 6.2 (from package.json)`. Version missing or a range → ask; the version decides which pattern is correct.
2. **Fetch the exact doc page** for the feature — not the homepage, not a web search. `react.dev/reference/react/useActionState`, not "react docs". Authority order: official docs → official blog/changelog → web standards (MDN, web.dev) → runtime/browser compat (caniuse, node.green). Stack Overflow, tutorials, and your own memory are never primary sources.
3. **Implement to the documented pattern.** Use the signatures from the page. If the docs deprecate a pattern, don't emit it. If the docs don't cover it, say so and flag it unverified rather than filling the gap from memory.
4. **Surface conflicts, never resolve them silently.** Docs recommend one thing, the existing codebase does another → present both (modern-per-docs vs match-existing) with the source link and let the user pick. Same when two official sources disagree (migration guide vs API reference) — name the discrepancy.
5. **Cite every framework-specific decision.** Full URL, deep-linked to the anchor (`/useActionState#usage` — anchors survive doc restructuring better than top-level pages), in a code comment and/or the message. Quote the relevant passage when the decision is non-obvious.

## Constraints

- A pattern you could not find in official docs ships with an explicit `UNVERIFIED — based on training data, may be outdated` flag. Not silent, not a vague "this might be outdated" hedge — verify and cite, or flag clearly.
- Citations are full URLs with anchors, never shortened links or a bare homepage.
- Fetch the one relevant page, not the whole docs site — token frugality.
- Exempt: version-agnostic logic, renames, file moves, typo fixes, or when the user explicitly asks for speed over verification.
- Confidence is not evidence. "I'm sure about this API" is the exact moment to check — training data is full of patterns that look correct and broke a major version ago.

## Report format

```
STACK: <lib> <version> (from <manifest>)
SOURCES:
  - <pattern> → <full doc URL#anchor>
UNVERIFIED:
  - <pattern> — no official doc found; training-data-based, verify before prod
CONFLICTS surfaced: <n> (resolved-by-user | pending)
```
