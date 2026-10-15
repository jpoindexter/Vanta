# Measure a doctype-less wireframe in standards mode, then list its CSS accidents

Date: 2026-10-13 · Area: desktop-next pages parity

The approved wireframe HTML has no `<!doctype>`, so loading the file directly renders in quirks
mode: line boxes without text lose the strut, and two-line rows came out 54.7px instead of the
57.6px every standards-mode engine (and the published artifact, which gets a document skeleton)
produces. A first parity run against the raw file reported ~450 false FAILs, all from that.

How to apply: prepend `<!doctype html>` before measuring (`tools/parity-pages.mjs`). Then read the
residual diffs as either build bugs or wireframe accidents: `.code` without `white-space:pre`
(multi-line diffs collapse), and `.w1100 .badge/.nav` rules written for the sidebar rail that also
hit Home and Settings. Accidents become named DEVIATION rows with a reason, never silent
"fixes", so the owner can overrule them.
