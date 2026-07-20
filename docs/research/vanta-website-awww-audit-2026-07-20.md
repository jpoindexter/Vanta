# Vanta Website AWWW Audit

Date: 2026-07-20  
Surface: `https://vanta.theft.studio/`  
Method: AWWW weighted review plus rendered responsive, accessibility, and performance proof.

## Result

Internal candidate score: **8.9 / 10**. This is an internal design review, not an Awwwards jury result.

| Criterion | Weight | Score | Evidence |
|---|---:|---:|---|
| Design | 40% | 9.1 | Supplied raven artwork owns the first fold; the exact black/bone/violet system is used continuously; typography and product evidence maintain a clear hierarchy. |
| Usability | 30% | 9.0 | Primary download is visible in the first fold; desktop views are interactive and keyboard-focusable; actions remain single-line; no horizontal overflow at tested widths. |
| Creativity | 20% | 9.0 | The engraved raven identity and kernel-focused voice are specific to Vanta rather than a generic AI landing template. |
| Content | 10% | 8.6 | Real release, notarization, product screens, safety contract, terminal run, and install paths are retained. The page does not invent testimonials or impact metrics. |

Weighted score: `(9.1 × .40) + (9.0 × .30) + (9.0 × .20) + (8.6 × .10) = 9.00` before the performance deduction. A 0.1 deduction reflects the Docusaurus JavaScript floor measured below.

## Executed Proof

- Production Docusaurus build: passed.
- Chromium renders: 1440×1000, 768×1024, 414×896, 375×812, and 320×700.
- Horizontal overflow: none at every tested width.
- Landing-page console and page errors: none.
- Responsive raven assets: all loaded with intrinsic dimensions.
- Desktop view tabs: clicking Models changed the rendered product image at every tested width.
- Lighthouse mobile: Performance 74, Accessibility 100, Best Practices 100, SEO 100.

## Remaining Constraint

Performance is bounded by the current Docusaurus client bundle. The new LCP artwork is responsive and reduced to 57 KB at 600 px and 138 KB at 900 px, but a separate static marketing build would be the next material performance step. That tradeoff is not justified while the site and documentation intentionally share one deployment.
