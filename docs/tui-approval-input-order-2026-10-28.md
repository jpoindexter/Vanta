# Terminal approval input ordering — 2026-10-28

Source checkpoint, not an installed CLI update or public release. Normal CLI70
and signed/notarized Desktop agent11 remain unchanged. The pending CLI cutover
must include this newly discovered repair before switching the normal command.

## Reproduced cause and change

In the actual terminal, a single input burst containing Down then Enter moved
the visible selection to “don't ask again” but submitted the previous first
choice. Its project rule remained `ask`; after `/restart`, the next edit prompted
again. React had not committed the new selection between Ink's synchronous key
events. Rapidly selecting No could likewise submit Yes.

The shared approval prompt now reads its selection synchronously, using the
same ref-plus-render-state pattern as the existing composer. Arrow movement,
Enter and external focus synchronization use that one setter/current value.
Numeric shortcuts, Escape, eligibility, persistence errors, cancellation and
the decision lock are unchanged. No approval policy or Rust source changes.
Default and opt-in v2 use this same prompt.

## Executed evidence

- Four initial actual-Ink regressions failed on the original implementation.
  The completed five-case test covers Always, rapid Deny, wrapped Never,
  Down/Up one-off and fresh-only Deny, with exact private on-disk rules.
- Forty focused checks across five approval test files pass. The maintained
  native TypeScript checker passes `--noEmit`; the two changed files have zero
  strict size findings. Scoped whitespace checks pass.
- The same single-burst Down/Enter runs through the actual global wrapper and
  supported launcher in a private TTY candidate. It saves the project-scoped
  edit preference, edits one file, reloads the same session via `/restart`, then
  edits a second file without another approval. Terminal and service exit 0.
  The candidate is committed f2bc276b source plus the exact prompt postimage;
  it is not the normal selected CLI or a new installed Desktop.
- Initial f2 startup-generation MCP execution passes 16 checks with real stdio
  children and mapped effect journals. Its actual HTTP router passes 38 checks:
  admission/Stop/queue ownership plus original live-runtime discovery, exact
  observation, wrong credential/client/profile rejection and interrupted result
  retention. These are not executions of a future post-commit pin.

The original failed terminal replay and test logs are retained. An intermediate
test expectation used macOS's noncanonical `/var` spelling; it now checks the
actual canonical project root. A guessed compiler entry was absent; the
maintained native checker was then executed successfully. Neither diagnostic is
counted as passing proof.

## Scope and remaining delivery

Private scripted model and real existing kernel/file work, not a real model,
owner profile, live account, full keyboard parity or new kernel-policy proof.
The HTTP conversation and MCP assessment are isolated fixtures. Independent
review found no source-commit blocker but explicitly withheld CLI-cutover
acceptance pending the new pin's identity/compiled-byte/receipt verification.

Original work and owner data remain preserved; no credentials or approvals are
copied. No whole-card status/Done promotion, main merge, release/tag, CI/spend,
legacy capability removal or protected source change. Next: pin this repair,
verify that exact candidate, then perform the separately authorized cutover.
