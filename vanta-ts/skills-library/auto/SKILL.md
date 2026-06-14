---
name: auto
description: "Auto-minimalism: before writing code, climb the YAGNI→stdlib→native→dep→one-line ladder; prefer reuse and deletion over new code; mark deliberate shortcuts with their ceiling. Generative discipline applied while building — complements cc-simplify (post-hoc review)."
---

# Auto — do the least that works

The best code is the code never written. Before writing any code, stop at the first rung that holds:

1. **Does this need to exist at all?** (YAGNI) — the cheapest code is none.
2. **Does the standard library do it?** Use it.
3. **Does a native platform feature cover it?** Use it. (Node has `fetch`, `crypto`, `path` — reach for them before a dep.)
4. **Does an already-installed dependency solve it?** Use it. Don't add a new one — flag it first (name, size, license) per the deps rule.
5. **Can it be one line?** Make it one line.
6. **Only then:** write the minimum that works.

## Rules

- No abstractions that weren't explicitly requested. Rule of 3: don't generalize before three concrete uses.
- No new dependency if it can be avoided. Prefer stdlib / native `fetch` / what's already installed.
- Deletion over addition. Boring over clever. Fewest files.
- Question complex asks: "Do you actually need X, or does Y cover it?"
- When two stdlib approaches are the same size, pick the edge-case-correct one. Least code, not the flimsier algorithm.
- Mark a deliberate shortcut with an `auto:` comment that **names the ceiling and the upgrade path** — not a bare TODO:
  `// auto: O(n²) scan, fine <1k rows; swap to a Map index above that`

## Never cut corners on

Input validation at trust boundaries, error handling that prevents data loss, security, accessibility, and anything explicitly requested. Non-trivial logic leaves **one runnable check** behind — the smallest thing that fails if the logic breaks (an assert or one small test; no frameworks, no fixtures). Trivial one-liners need no test.

## In Vanta specifically

The size gate already enforces the floor mechanically (file ≤300 / fn ≤50 / params ≤4 / cx ≤10, checked on every `write_file`). Auto is the discipline *above* the gate: the gate stops bloat, auto stops the code from being written at all. Toggle it live with `/auto [lite|full|ultra]`; audit a diff for deletable code with `/auto review`.
