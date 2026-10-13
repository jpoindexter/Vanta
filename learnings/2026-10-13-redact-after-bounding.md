# Bound text before redacting it, then drop the cut tail

Date: 2026-10-13 · Area: desktop SSE / redaction

`redactForLog` (structural + vendor regexes) is superlinear on long unspaced runs: 50 KB of one
word took about 3 s, 20 KB about 0.5 s. The first typed-event draft redacted whole tool args and
outputs and capped afterwards, which would stall the server event loop on a large base64 blob.
`runs/store.ts` `redactValue` has the same shape (redact, then slice to 4000).

Fix in `desktop/typed-events.ts`: cut to the cap first, redact the bounded head, then drop the last
128 chars so a secret straddling the cut leaves no recognisable fragment.

How to apply: any new redaction at an emit point should bound input length before calling
`redactForLog`, and set a `truncated` flag rather than slicing silently (the red test that found
this was a 50 KB arg that came back `truncated: false`).
