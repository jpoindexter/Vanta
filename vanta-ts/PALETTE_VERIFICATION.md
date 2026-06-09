# Palette v2 Verification Guide

## Live Testing

To verify the fuzzy-searchable command palette with risk labels in a live TUI session:

### Prerequisites
```bash
cd vanta-ts
npm install
# Ensure the kernel is running (./run.sh auto-starts it, or: cargo run --manifest-path ../Cargo.toml -- serve 7788)
```

### Test Steps

1. **Start the TUI**
   ```bash
   ./run.sh
   # Or: npm run vanta
   ```

2. **Test fuzzy search + risk labels**

   **Test A: `/go` (partial word)**
   - Type: `/go`
   - Expected results (in order):
     ```
     › /goal <text|status|clear|done N>  [approval]  set / manage a goal
       /goals                            [local]    list active goals from kernel
     ```
   - Verify: Both match "go", `/goal` scores higher (exact substring)

   **Test B: `/hist` (subsequence)**
   - Type: `/hist`
   - Expected: `/history` appears with `[local]` label
   - Verify: Fuzzy match finds h-i-s-t in order

   **Test C: `/rew` (word boundary)**
   - Type: `/rew`
   - Expected: `/review` appears with `[approval]` label
   - Verify: Word boundary bonus ranks it first

   **Test D: `/` (show all)**
   - Type: `/` (pause typing)
   - Expected: First 8 commands shown with risk labels:
     ```
     › /help                        [local]   show this command list
       /clear                       [local]   start a fresh conversation
       /reset                       [local]   start a fresh conversation (alias of /clear)
       /history                     [local]   show this conversation's transcript
       /export                      [local]   export this conversation to a markdown
       /retry                       [local]   re-run your last message
       /undo                        [local]   drop the last turn from the conversation
       /model                       [local]   change provider & model — interactive picker
     ```
   - Verify: All 8 results visible, risk labels aligned, descriptions clipped

3. **Test navigation + autocomplete**

   - Type: `/mod` and press **Tab**
     - Expected: Input becomes `/model ` (command auto-completed)
     - Verify: Risk label visible during selection

   - With palette showing, press **↑↓** arrows
     - Expected: Selection marker moves, current row highlights in cyan
     - Verify: Risk labels remain visible and aligned

4. **Verify risk tier accuracy**

   - Sample commands and expected tiers:
     ```
     /help          → [local]      (info, no approval)
     /goal          → [approval]   (state change, approval needed)
     /tasks         → [approval]   (operator control)
     /restart       → [approval]   (session restart)
     /add-dir       → [kernel]     (path scope assessment)
     /clear         → [local]      (ephemeral, no approval)
     /shell-cmd     → [kernel]     (safety assessment)  // if implemented
     ```

5. **Terminal width clipping**

   - Resize terminal to 40 columns
   - Type: `/help`
   - Expected: Descriptions clipped with `…` ellipsis, no wrapping
   - Resize to 120 columns
   - Expected: Full descriptions visible, more width for risk labels

## Automated Tests

All tests pass:
```bash
npm test -- src/tui/

 Test Files  25 passed (25)
      Tests  186 passed (186)
```

Individual test files:
- `src/tui/fuzzy.test.ts` — 7 tests (fuzzy scoring logic)
- `src/tui/command-risk.test.ts` — 6 tests (risk classification)
- `src/tui/palette.test.tsx` — 4 tests (palette rendering + risk labels)
- `src/tui/app.test.tsx` — 14 tests (palette integration in App)

## Success Criteria

✓ Palette appears when typing `/word`
✓ Fuzzy search matches commands in order of relevance
✓ Risk labels display: `[local]`, `[kernel]`, `[approval]`
✓ Risk labels align in a fixed column
✓ Descriptions clip to fit terminal width
✓ Navigation (↑↓ Tab) works
✓ All 56 slash commands have a risk tier
✓ Terminal resizing handles clipping gracefully
✓ Zero type errors (`tsc --noEmit`)
✓ All TUI tests pass (186 tests)

## Troubleshooting

**Palette doesn't appear**: Check that you're typing a bare `/word` with no spaces after the slash.

**Risk labels misaligned**: Check `riskCol` width in `Palette` component (line 124 in transcript.tsx). Currently set to 11 characters `"[approval] "`.

**Fuzzy scoring unexpected**: Review `fuzzyScore` logic in fuzzy.ts — word boundaries get +15, consecutive matches get +10*count.

**Tests fail**: Run `npm test -- src/tui/` to see which specific test failed. Common issue: pre-existing test failures in agent.ts (unrelated to palette changes).
