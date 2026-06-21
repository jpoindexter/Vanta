// ARG-EXPAND — pure positional + $ARGUMENTS substitution for skill / slash-command
// bodies, with a backslash escape that yields a LITERAL placeholder.
//
// Mirrors and generalizes `frontmatter.ts:expandSkillArgs` (which handled only
// `$ARGUMENTS`) to the full positional set `$1..$9`. The wire point (not done this
// round, named for clarity-gate parity): wherever a skill body or slash-command
// body is run with user arguments — the skill run path (the `expandSkillArgs`
// call site that `frontmatter.ts` was built for) and the slash-command body
// expansion — would call `expandArgs(body, args)` instead of the
// `$ARGUMENTS`-only `expandSkillArgs`.
//
// Semantics (single left-to-right pass; each `$`-token consumed exactly once, so
// an escape can't be double-processed and a substituted arg that itself contains
// `$1`/`$ARGUMENTS` is never re-scanned):
//   - `$1`..`$9`        → args[0]..args[8]
//   - `$ARGUMENTS`      → args.join(" ")
//   - `\$1` / `\$ARGUMENTS` → literal `$1` / `$ARGUMENTS` (the backslash is
//                         consumed; NO substitution)
//   - `\\$1`            → a literal backslash + the substituted arg (an escaped
//                         backslash is NOT an escape of the `$`)
//   - `$` alone, or `$x` where x is not a digit/ARGUMENTS → left as-is
//   - out-of-range `$5` with fewer args → "" (empty string) — documented choice:
//     positional placeholders past the supplied args collapse to empty, matching
//     shell positional-parameter behavior (`$5` with 2 args is empty, not literal)
//
// Pure, synchronous, errors-as-values (no throws): bad input degrades to a
// sensible body (no `$` / no escapes / no args → unchanged).

// One token = an optional escaping backslash, a literal `$`, then either ARGUMENTS
// or a single digit. Matching ARGUMENTS before `\d` is irrelevant (they're
// disjoint) but explicit. The optional leading `\\` is the escape marker — when
// present the token is emitted literally (without that one backslash).
//
// A PRECEDING backslash that is itself escaped (`\\$1`) must NOT count as an
// escape of the `$`. We handle that by also matching an even run of backslashes:
// the regex captures any run of backslashes before `$`, and we decide escape by
// the run's parity (odd = the `$` is escaped; even = it is not).
const TOKEN_RE = /(\\*)\$(ARGUMENTS|\d)/g;

const POSITIONAL_BASE = 10; // base for parsing a single `$N` digit

/**
 * Expand `$1..$9` and `$ARGUMENTS` placeholders in `body` using `args`, honoring
 * a backslash escape (`\$1` → literal `$1`). Single left-to-right pass; pure.
 *
 * @param body the skill / slash-command body (may contain placeholders)
 * @param args positional arguments; `$1` → `args[0]`, `$ARGUMENTS` → joined
 * @returns the expanded body — unchanged when there are no placeholders
 */
export function expandArgs(body: string, args: readonly string[]): string {
  if (body === "" || !body.includes("$")) return body;

  return body.replace(TOKEN_RE, (_match, slashes: string, token: string) => {
    // Parity of the backslash run decides escaping. Odd → the final backslash
    // escapes the `$`; emit the surviving (paired) backslashes + the LITERAL
    // placeholder, no substitution. Even → none of the backslashes escape the
    // `$`; emit them all + the SUBSTITUTED value.
    const halfSlashes = "\\".repeat(Math.floor(slashes.length / 2));
    const escaped = slashes.length % 2 === 1;

    if (escaped) return `${halfSlashes}$${token}`;
    return `${halfSlashes}${substitute(token, args)}`;
  });
}

/** Resolve one bare token (`ARGUMENTS` or a single digit) to its arg value. Pure. */
function substitute(token: string, args: readonly string[]): string {
  if (token === "ARGUMENTS") return args.join(" ");
  const index = Number.parseInt(token, POSITIONAL_BASE) - 1; // `$1` → args[0]
  // `$0` → index -1 → undefined → ""; any out-of-range `$N` → "" (documented).
  return args[index] ?? "";
}
