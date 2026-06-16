---
name: doubt-gate
description: Cross-examine a non-trivial decision in-flight — before it stands — with a fresh-context reviewer biased to disprove. The in-flight complement to adversarial-verify (which refutes finished output). Use for branching logic, boundary crossings, properties the compiler can't check (thread-safety, idempotence, ordering, invariants), or irreversible blast radius (deploy, migration, public API).
---
# Doubt-Gate

A confident answer is not a correct one, and long sessions quietly turn assumptions into "facts" nobody re-checked. Before a non-trivial decision stands, hand the artifact to a fresh-context reviewer told to disprove it. This is the in-flight complement to `adversarial-verify`: that skill refutes finished output, this one cross-examines a decision *while course-correction is still cheap*.

A decision is **non-trivial** when any holds: it adds or changes branching logic; crosses a module or service boundary; asserts a property the compiler can't verify (thread-safety, idempotence, ordering, an invariant); its correctness depends on context the next reader can't see; or its blast radius is irreversible (deploy, data migration, public API change). Mechanical ops — rename, format, file move, one-line obvious changes, running tests — are exempt. Doubt every keystroke and you ship nothing.

## Steps

1. **CLAIM** — name the decision and why it matters in two or three lines. If you can't write it that compactly, you have a vibe, not a decision; surface it before scrutinizing it.
2. **EXTRACT** — isolate the smallest reviewable unit: the diff or function (not the whole file), or the proposal in 3–5 sentences plus the constraints it must satisfy. Strip your reasoning — hand over conclusions and you get back validation of your conclusions. Over ~500 lines → decompose first.
3. **DOUBT** — spawn a fresh-context reviewer (a *separate* agent context, never the one that produced the artifact). The prompt is adversarial and receives ARTIFACT + CONTRACT only — never the CLAIM, which biases toward agreement:
   ```
   Adversarial review. Find what is wrong with this artifact.
   Assume the author is overconfident. Look for: unstated assumptions,
   unhandled edge cases, hidden coupling or shared state, ways the contract
   could be violated, conventions this breaks, failure modes under bad input.
   Do NOT validate. Do NOT summarize. Find issues, or state explicitly that
   you cannot find any after thorough examination.
   ARTIFACT: <paste>   CONTRACT: <paste>
   ```
4. **Cross-model (interactive only — always offer, never silently skip).** A same-model reviewer shares the author's blind spots; a colder, different-architecture model catches them. After the single-model pass, offer the user a second opinion (Gemini / Codex CLI, or manual). If they pick a CLI: check it's on PATH and actually runs, confirm the exact invocation, pass ARTIFACT + CONTRACT via stdin or a temp file (never interpolate the artifact into a shell-quoted arg — code contains backticks and `$(...)`), and run it read-only/sandboxed. Non-interactive context (CI, `/loop`, autonomous run) → skip and announce the skip. Never invoke an external CLI without explicit per-run authorization.
5. **RECONCILE** — the reviewer's output is data, not verdict. Re-read the artifact against each finding (rubber-stamping the reviewer is the same failure as ignoring it). Classify, first match wins: **contract-misread** (your contract was unclear — fix it, re-loop) → **valid + actionable** (real issue — change it, re-loop) → **valid trade-off** (real but cost of fixing exceeds cost of accepting — document it for the user) → **noise** (correct under context the reviewer lacked).
6. **STOP** — bounded loop, not recursion. Stop when the next cycle returns only trivial/already-seen findings, OR 3 cycles are done (escalate to the user, don't grind a 4th alone), OR the user says ship it. Three unresolved cycles is information about the artifact, not a reason to keep looping. If 3 feels "obviously insufficient," the artifact is too big — go back to EXTRACT and decompose; don't lift the bound.

## Constraints

- Reviewer receives ARTIFACT + CONTRACT only — never the CLAIM or your reasoning.
- Adversarial framing only ("find what's wrong"), never "is this good?". Framing decides the answer.
- Separate agent context — never let the producer self-verify its own artifact.
- **Doubt theater** (checkable signal): across 2+ cycles where the reviewer surfaced substantive findings, zero were classified actionable → you're validating, not doubting. Stop and escalate.
- Don't re-spawn on an unchanged artifact — same input, same findings, you're stalling.
- External CLI: PATH check + working-binary test + user-confirmed syntax + explicit authorization, every single run.
- Disagreement is information, not a verdict — the reviewer lacks your context, so reconcile, don't defer.

## Report format

```
CLAIM: <decision> — <why it matters>
Cycles: <n> (stop: trivial | 3-cap | user)
Findings: <total>
  actionable: <n> — <what changed>
  trade-off:  <n> — <documented for user>
  noise:      <n>
Cross-model: offered → <tool used | skipped: reason>
Status: resolved | escalated (3 unresolved cycles — artifact may not be ready)
```
