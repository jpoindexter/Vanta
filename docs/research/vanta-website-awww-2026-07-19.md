# Vanta website AWWW audit - 2026-07-19

## Brief

Update the public Vanta documentation site with the current desktop release, current product screenshots, and a clearer product story. Use Cline for immediate comprehension and proof density, and Hermes Agent for distinctive art direction and direct installation, without copying either site.

References:

- [Cline](https://cline.bot/)
- [Hermes Agent](https://hermes-agent.nousresearch.com/)
- [Vanta Desktop v0.9.4](https://github.com/jpoindexter/Vanta/releases/tag/v0.9.4)

## Result

The homepage now uses Vanta's Ghost black-and-white identity across one long product page. It leads with the existing operator portrait, exposes the notarized macOS release immediately, replaces generic diagrams with four current desktop captures, and separates shipped execution layers from graph orchestration that remains on the roadmap.

Evidence:

- [Desktop capture](./vanta-website-awww-2026-07-19/desktop-home.png)
- [Mobile capture](./vanta-website-awww-2026-07-19/mobile-home.png)

## AWWW score

| Criterion | Weight | Score | Weighted |
| --- | ---: | ---: | ---: |
| Design | 40% | 8.9 | 3.56 |
| Usability | 30% | 9.2 | 2.76 |
| Creativity | 20% | 8.4 | 1.68 |
| Content | 10% | 9.1 | 0.91 |
| **Overall** | **100%** |  | **8.91 / 10** |

**Level: Developer Award.** The result clears the 8.5 threshold. It does not claim Site of the Day because the current Docusaurus shell limits technical distinctiveness and adds homepage JavaScript that the product page does not need.

## Why the score holds

### Design

- The first viewport identifies Vanta, shows the actual operator identity, and exposes the real release.
- The palette is black, white, and neutral paper. Amber appears only as a focus signal.
- Typography uses the native Apple/system stack with SF Mono for real machine data.
- Section geometry comes from Vanta's boundary model: release ledger, operator surface, capability rows, execution layers, kernel contract, and install paths.
- Current product captures carry the interface story instead of fake windows or CSS diagrams.

### Usability

- The primary desktop download is visible without scrolling.
- The terminal install command remains visible as a separate path.
- Product tabs have tab semantics, selected state, keyboard focus, and real content changes.
- Shipped and roadmap states are stated explicitly.
- Desktop and 390px mobile checks show no horizontal overflow or clipped text.
- Lighthouse accessibility, best practices, SEO, and agentic browsing score 100.

### Creativity

- The Ghost operator portrait and strict evidence-led composition are specific to Vanta.
- The page avoids the common SaaS stack of feature cards, pricing cards, testimonials, FAQ, and a gradient CTA.
- The execution-layer ledger turns Vanta's prompt-to-graph model into product information instead of decoration.
- The remaining constraint is the standard Docusaurus navigation and documentation shell.

### Content

- Copy names outcomes before internal systems.
- v0.9.4 release claims are backed by the public GitHub release and notarization evidence.
- Graph orchestration is labeled Roadmap rather than represented as shipped.
- Screenshots show Work, Connect, Models, and Approvals from the current visual baseline suite.

## Anti-slop re-check

- No gradients, glow fields, decorative orbs, bokeh, or full-page grid backgrounds.
- No hero eyebrow pill, gradient text, floating cards, fake app window, or fake code window.
- No filled-plus-outline CTA pair. The hero has one primary download and a real terminal command.
- No Google display-font rotation, Inter, JetBrains Mono, Space Grotesk, Sora, or serif-plus-sans costume.
- No card hover lift, button boop, scale-on-press, all-around bloom, glass, or entrance animation.
- No testimonial, pricing, FAQ, logo wall, stats vanity claim, fake customer, or decorative quote.
- No rounded text chips used as metadata. Release and execution states use plain typography.
- No icon tiles or manually redrawn feature icons. The page uses the real Vanta mark and product imagery.
- No nested cards. Sections are full-width bands; borders organize comparable data.
- No repeated oversized capability bands. Six capabilities are compact, scannable rows.
- No hidden content dependent on JavaScript animation. The page remains readable without motion.
- No cut-off text, overlapping controls, horizontal overflow, or unreadable mobile button labels in tested viewports.
- No dead custom controls. All four product tabs were clicked and changed the active image.
- The desktop screenshot dimensions are fixed at 3:2 and mobile sources prevent unnecessary image transfer.
- Focus appears only for keyboard navigation through `:focus-visible`.
- Light and dark modes both render from the same neutral Ghost system.

## Verification

- `npm run typecheck`
- `npm run build`
- Browser proof at 1440 x 960 and 390 x 844
- Product-tab interaction proof
- Light/dark mode proof
- Lighthouse: performance 81, accessibility 100, best practices 100, SEO 100, agentic browsing 100
- Lighthouse metrics: FCP 1.4 s, LCP 5.1 s, CLS 0, TBT 40 ms

Performance remains below 90 because the Docusaurus application shell sends documentation and search JavaScript on the homepage. Reaching the next award tier would require a separate static marketing entry or route-level bundle reduction, not more visual decoration.
