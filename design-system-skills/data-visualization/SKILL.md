---
name: data-visualization
description: Choose, encode, color, label, and ship accurate accessible charts and dashboards — perceptual encoding ranking, chart-by-intent selection, data color scales, Tufte's data-ink discipline, and interaction patterns with concrete do/don't rules.
tags: [design-systems, data-viz, charts, dashboards]
---
# Data Visualization & Dashboards

A chart is an **answer to a question**, not decoration. Before any encoding decision, state the question in one sentence ("Which region grew fastest last quarter?"). The question dictates the chart; the data dictates the scale; perception dictates the encoding. This skill gives the ranking, the chart map, the color math, and the discipline to ship charts that read correctly on any screen.

## 1. Purpose-first — the question drives everything

Never start from "what data do I have." Start from the verb in the user's question, then map it to an intent. The intent picks the chart (§3). If you can't name the question, you can't pick the chart — and a chart with no question becomes a rainbow blob that demos well and informs nothing.

| The user asks… | Intent | Default chart |
|---|---|---|
| "How do these categories compare?" | Comparison | Bar (horizontal if labels long) |
| "How has this changed over time?" | Trend | Line (area only if cumulative/stacked) |
| "What makes up the total?" | Part-to-whole | Stacked bar / treemap |
| "How is this spread out?" | Distribution | Histogram / box / violin |
| "Do these two move together?" | Correlation | Scatter |
| "Where is this happening?" | Geospatial | Choropleth / symbol map |
| "How does flow move between stages?" | Flow | Sankey / alluvial |
| "Who's on top?" | Ranking | Sorted bar / bump / slope |
| "What's the single number now?" | KPI | Big number + sparkline |

**Do** put the question or its answer in the chart title ("Sales grew 23% in EMEA"), not the chart type ("Bar chart of sales"). **Don't** ship a "dashboard of everything" — that's a furniture catalog, not an analysis.

## 2. Visual encoding — pick by perceptual accuracy

Cleveland & McGill (1984, JASA) ran controlled experiments ranking how *accurately* humans decode quantitative values from each visual channel. This is the single most important table in data viz. **Encode your most important quantity with the highest channel you can.**

| Rank | Channel | Decode accuracy | Where it shows up |
|---|---|---|---|
| 1 | **Position** on a common scale | Best | Bar tops, scatter dots, dot plots |
| 2 | **Position** on non-aligned scales | Very good | Small multiples |
| 3 | **Length** | Good | Bars, stacked-bar segments |
| 4 | **Angle / slope** | Moderate | Slopegraphs, line steepness |
| 5 | **Area** | Poor | Bubbles, treemaps |
| 6 | **Volume / 3D** | Very poor | (avoid) |
| 7 | **Color hue / saturation** | Worst for quantity | Heatmaps, choropleths |

**Rule:** position > length > angle/slope > area > volume > color. A pie chart asks the eye to compare *angles and areas* (ranks 4–5); the same data as a bar chart uses *position/length* (ranks 1–3) — which is exactly why bars beat pies. Munzner (*Visualization Analysis & Design*, 2014) frames this as matching channel "effectiveness" to attribute importance: spend your best channel on what matters most.

- **Do** reserve position for the primary measure; relegate color to *categories*, not magnitudes you need read precisely.
- **Don't** encode an important value as bubble area — readers underestimate area ~0.7 power (Stevens' law). If you must use bubbles, size by **diameter via area** (`r ∝ √value`), never radius∝value.

```js
// Bubble sizing — correct: human-perceived size ∝ value
const r = maxR * Math.sqrt(value / maxValue);   // ✅ area encodes value
const rWrong = maxR * (value / maxValue);        // ❌ radius∝value → 2× value looks 4× big
```

**Worked example.** "Which of 6 plans sells most?" Magnitude (units sold) is the question → give it **position/length** (sorted horizontal bar, rank 1+3). Plan *tier* is a secondary categorical attribute → give it **color hue** (rank 7, fine for nominal grouping). Don't invert this and make units the bubble area and tier the X-position — you'd spend your best channel on the thing you care least about.

## 3. Chart selection by intent

**Comparison → bar.** Position+length, ranks 1 and 3. Horizontal bars when category labels are long (no rotated 45° text). Sort by value unless the category has a natural order (time, age bins). One color unless a category needs to pop.

**Trend over time → line.** Time on X (always), value on Y. Lines show rate-of-change (slope) directly. Use **area** only for a single cumulative series or stacked totals where the filled mass *is* the message; stacked areas above 3–4 bands become unreadable (you can't judge a middle band's thickness against a wavy baseline). Never stack non-additive metrics.

**Part-to-whole → stacked bar or treemap; rarely pie.** A pie is acceptable for **2–3 slices** showing a rough split (60/40). Beyond that it fails: humans can't rank angle/area, and labels collide. A 100%-stacked bar compares the same parts across categories far better. Treemaps handle hierarchy and many parts but inherit area's low accuracy — use for "roughly how big" not "exactly how much." **Donut = pie with a hole; same problems.**

**Distribution → histogram / box / violin.** Histogram shows shape (modes, skew, gaps) — bin width is the key decision (too wide hides structure, too narrow is noise). Box plot compresses to median/quartiles/outliers — great for comparing many groups side by side, but **hides bimodality** entirely. Violin (or beeswarm/strip) restores the shape box plots throw away. **Don't** show a mean ± error bar and call it a distribution; it hides everything Anscombe's quartet and the datasaurus dozen warn about — wildly different data, identical summary stats.

```js
// Bin width — Freedman–Diaconis (robust to outliers; default in most libs)
const iqr = q3 - q1;
const binWidth = 2 * iqr / Math.cbrt(n);   // then bins = ceil((max-min)/binWidth)
// Quick fallback: bins ≈ ceil(√n). Always offer a manual override — one bin width never fits all data.
```

**Correlation → scatter.** Two quantitative axes, position on both (ranks 1–2). Add a trend/LOESS line for direction, faceting or color for a third categorical dimension. For >~2k points use opacity, hexbin, or density contours to fight overplotting. Don't infer causation from a scatter.

**Geospatial → choropleth or symbol.** Choropleth (regions shaded by value) must use a **rate or normalized value**, never a raw count — otherwise you're just drawing a population map. Symbol/bubble maps avoid the area-size bias of unequal regions. Beware that large rural regions visually dominate small dense urban ones (the "land doesn't vote" problem).

**Flow → Sankey / alluvial.** Width = magnitude (length channel) across stages; good for budgets, funnels, migration. Keep nodes few; crossing ribbons get hairball-y fast.

**Ranking → sorted bar, bump, or slopegraph.** Slopegraph (Tufte) compares two time points across items with one line each — reads rank changes instantly.

**KPI / big-number.** One metric, huge, with a delta (▲ +12% vs last week) and a sparkline for context. The number *is* the chart.

### Per-chart anatomy cheatsheet
| Chart | Primary channel | Sort | Baseline | First thing to get right |
|---|---|---|---|---|
| Bar | position + length | by value | **must be 0** | horizontal if labels long; one color |
| Line | position / slope | n/a (time order) | data-fit OK | time on X; ≤5 series or highlight one |
| Stacked bar | length | total or fixed order | 0 | put the series you compare at the baseline |
| Histogram | position + length | bin order | 0 | bin width (FD/√n); show the override |
| Box / violin | position | by median | n/a | violin if bimodality possible |
| Scatter | position ×2 | n/a | data-fit | overplotting → opacity/hexbin past ~2k |
| Choropleth | color (rank 7) | n/a | n/a | **normalize to a rate**, not raw count |
| Treemap | area (rank 5) | by value | n/a | "roughly how big" only; label leaves |

### When NOT to chart
- **One number** ("uptime: 99.98%") → big-number tile, not a gauge.
- **Precise lookup values** people will read individually → **a table**. Charts are for patterns; tables are for exact values. A sortable table beats a 30-bar chart when users need the actual figures.
- **2–3 data points** → a sentence. "Revenue rose from $4.1M to $5.0M."
- **No variation / no question** → nothing. Don't manufacture a chart to fill a card.

## 4. Color for data

Color is rank 7 for quantity — use it deliberately, by scale type.

| Scale | Data | Example | Rule |
|---|---|---|---|
| **Sequential** | Ordered, one-directional (0→high) | Viridis, single-hue ramps | Light = low, dark = high; perceptually even steps |
| **Diverging** | Centered around a midpoint (− 0 +) | RdBu, BrBG | Neutral middle (white/grey); set the midpoint meaningfully (0, mean, target) |
| **Categorical** | Unordered groups | Okabe-Ito, Tableau-10 | Distinct hues, similar lightness; **max ~7** |

- **Build perceptual ramps in OKLCH** — equal `L` steps look equally spaced; HSL "lightness" lies and yields muddy uneven ramps.

```css
/* Sequential ramp — even perceptual lightness, fixed hue. Low→high = light→dark. */
--seq-1: oklch(0.96 0.03 250);  --seq-2: oklch(0.86 0.07 250);
--seq-3: oklch(0.74 0.11 250);  --seq-4: oklch(0.60 0.15 250);
--seq-5: oklch(0.46 0.15 250);
/* Diverging — neutral grey midpoint, two hues out. Set midpoint to 0/target, not data-min. */
--div-neg: oklch(0.55 0.16  25);  --div-mid: oklch(0.92 0.01 250);  --div-pos: oklch(0.55 0.13 145);
```

Okabe-Ito categorical (CVD-safe, ship these): `#000000 #E69F00 #56B4E9 #009E73 #F0E442 #0072B2 #D55E00 #CC79A7`.
- **Colorblind-safe is non-negotiable.** ~8% of men have red-green deficiency. **Never** encode meaning in red-vs-green alone. Use the **Okabe-Ito** palette (designed for CVD) or ColorBrewer's colorblind-safe sets. Test in a deuteranopia simulator.
- **Max ~7 categorical colors** (Miller's limit territory). Past that, hues blur — group the long tail into "Other," facet into small multiples, or use direct labels instead of a legend.
- **Semantic color must match convention:** red = bad/loss/danger, green = good/gain, amber = warning. **Never** make red "good" on a finance chart — it fights muscle memory. But don't rely on it alone (CVD): pair with icon/sign/position.
- **Sequential for ordered, diverging for centered** — using a rainbow (jet) for sequential data is a classic error: it introduces false boundaries at hue transitions and isn't monotonic in lightness. Viridis/Cividis replaced jet for exactly this reason.

## 5. Tufte discipline — maximize data-ink

Edward Tufte (*The Visual Display of Quantitative Information*, 1983):

- **Data-ink ratio** — maximize the proportion of ink that encodes data. Erase non-data ink: heavy borders, background fills, redundant gridlines, drop shadows, 3D bevels.
- **Chartjunk** — any decoration that doesn't carry information (textures, clip-art, gradients, mascots). Delete it.
- **No 3D on 2D data.** 3D bars/pies distort via perspective and occlude back rows. It *always* lowers accuracy. No exceptions for "pop."
- **Lie Factor** = (size of effect shown) / (size of effect in data). Should equal 1. Truncated/expanded axes, area-encoded 1D values, and inconsistent scales push it away from 1.
- **Bar axes start at zero.** Bars encode *length*; a non-zero baseline makes a 2% difference look like 200%. Non-negotiable for bars/columns/areas.
- **Line axes may NOT start at zero** — this is the nuance people get wrong. Lines encode *position/slope*, not length-from-baseline, so a zoomed Y-axis that reveals the actual variation is legitimate (and often necessary — forcing a stock chart to zero hides everything). Label the axis clearly and don't imply a false zero.
- **No dual Y-axes.** Two scales on one chart let you manufacture any correlation by sliding the axes; readers can't tell which series maps to which axis. Use two stacked panels (shared X) or index both series to 100 instead.
- **Small multiples** over one overloaded chart: many tiny same-scale charts beat one with 12 overlapping series.

```js
// The bar-vs-line axis rule, in code
const barYScale  = d3.scaleLinear().domain([0, max]).range([h, 0]);          // ✅ bars: domain[0]=0
const lineYScale = d3.scaleLinear().domain([min * 0.98, max * 1.02]).nice(); // ✅ lines: zoom to data, label clearly
// Forcing the line to [0,max] often flattens real variation to a meaningless straight line.
```

## 6. Labels, legends, annotations

- **Direct-label** lines/series at their end instead of a legend — kills the eye's round-trip between legend and line. Legends are a tax; pay it only when direct labels won't fit.
- **Annotate the insight.** A callout ("← launch", "outage") on the relevant point does more than a paragraph below the chart.
- **Gridlines subtle** — thin, low-contrast (light grey), behind the data. They're a reference, not content. Often only Y-gridlines are needed; drop X-gridlines for categorical.
- **Always show units and precision.** "$1.2M" not "1200000"; "42%" with consistent decimal places. Axis title carries the unit so tick labels stay short ("Revenue ($M)" → ticks "1, 2, 3").
- **Number formatting:** thousands separators, abbreviated magnitudes (K/M/B), aligned decimals in tables, and *don't* show false precision (3 sig figs is usually plenty).
- **Tooltips** carry the exact value + context on hover; the chart carries the pattern. Keep on-canvas labels sparse, push detail to tooltip.

```js
// Locale-aware, abbreviated, no false precision — use Intl, not hand-rolled
const axisFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
axisFmt.format(1_240_000);  // "1.2M"  ← short axis ticks
const pct = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 });
pct.format(0.234);          // "23.4%"
const money = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
money.format(5012);         // "$5,012"  ← tooltip shows exact; axis shows compact
// Tabular figures keep decimals aligned in tables: CSS  font-variant-numeric: tabular-nums;
```

## 7. Accessible charts

A chart that only works for sighted, full-color-vision, mouse users is broken for a large minority. WCAG 2.2 and common sense both require:

- **Never color-alone.** Redundantly encode with **direct labels, patterns/shapes, or position**. Line series: vary dash pattern + end-label, not just hue. Map regions: add value labels or hatching.
- **Provide a text alternative / data table.** Offer a toggle to view the underlying figures as an accessible `<table>`. This serves screen readers *and* power users who want exact numbers. A `<figure>` + `<figcaption>` summarizing the takeaway is the floor.
- **Contrast:** data marks ≥ 3:1 against background (WCAG 1.4.11 non-text contrast); text labels ≥ 4.5:1. Don't put pale-yellow bars on white.
- **Keyboard + ARIA:** interactive charts must be tabbable — focusable data points, arrow-key traversal, `role="img"` with `aria-label` for static charts, or proper `aria` on interactive SVG. A hover-only tooltip is inaccessible; expose the same data on focus.
- **Respect `prefers-reduced-motion`** — animated transitions, racing bar charts, and auto-rotating carousels can trigger vestibular issues. Gate transitions behind the media query; render the final state instantly when reduced motion is set.
- **Don't** rely on the title alone — screen readers need the *trend* described ("revenue rose then plateaued"), which a generated `aria-label` or caption should state.

```html
<!-- Floor pattern: figure + caption + collapsible data table -->
<figure role="group" aria-labelledby="cap">
  <svg role="img" aria-label="Revenue 2021–2024: rose to $5M then plateaued">…</svg>
  <figcaption id="cap">Quarterly revenue ($M). Peaked Q3 2023, flat since.</figcaption>
  <details><summary>View as table</summary>
    <table><caption>Revenue by quarter ($M)</caption>…</table>
  </details>
</figure>
```

```css
@media (prefers-reduced-motion: reduce) {
  .chart * { transition: none !important; animation: none !important; }  /* render final state instantly */
}
```

## 8. Dashboards

A dashboard is a *system* of charts. The hard part is hierarchy, not the individual charts.

- **Shneiderman's mantra:** "Overview first, zoom and filter, then details-on-demand." Top = the 3–5 KPIs answering "is everything OK?"; below = supporting breakdowns; detail tables/drill-downs last. Don't open on a wall of granular charts.
- **5-second rule:** a user should grasp the headline state in five seconds. If the most important number isn't the most prominent thing, re-rank. Big numbers top-left (F-pattern scan).
- **Group related metrics** with whitespace and shared cards (Gestalt proximity), not boxes-in-boxes. Align everything to a grid; ragged cards read as broken.
- **Filters apply globally** and stay visible (top bar or left rail); show active filter state explicitly. Cross-filtering (click a bar → filter the rest) is powerful but must be discoverable and reversible.
- **Density:** every chart costs attention. Cut any chart no one acts on. Prefer 6 decisive charts over 20 "nice to have" ones. A dashboard is for *monitoring and deciding*, not for exhaustively displaying the warehouse.
- **Real-time:** show data freshness ("updated 12s ago"), don't animate every tick (jitter is exhausting), and make the *change* salient (delta, not just current value).
- **Mobile dashboards:** stack to a single column, lead with the top KPI, make charts swipeable, enlarge touch targets (≥44px), and drop dense scatter/heatmaps for sparklines + numbers. Don't shrink a 12-series desktop chart onto a phone — re-author it.

## 9. Interaction

Interaction reveals detail without crowding the default view (Shneiderman's "details on demand").

- **Hover/focus → tooltip** with exact value, label, and context (vs. previous, % of total). Must also fire on keyboard focus.
- **Zoom / pan** for dense time series; provide a reset and keep an overview/context band.
- **Brush** (drag-select a range) to filter or zoom a linked view.
- **Drill-down** click → next level of the hierarchy (region → country → city), with breadcrumbs back up.
- **Cross-filter / linked highlighting** — selecting in one chart filters/highlights the others (Brushing & Linking). The single most valuable dashboard interaction; make selections visible and clearable.
- **Do** show a loading/empty/error state for every async chart — "no data for this filter" beats a blank rectangle. **Don't** make critical insight reachable *only* via interaction (hover-only data fails on touch, print, and screen readers).

## 10. Common mistakes (the catalog)

- **Pie with many slices** — unreadable past 3; use a sorted bar.
- **Dual Y-axes** — manufactures fake correlation; split into panels or index to 100.
- **Truncated bar baseline** — bars must start at zero; non-zero baselines lie (high Lie Factor).
- **Rainbow / jet sequential scale** — false boundaries, non-monotonic lightness; use Viridis/single-hue.
- **Red-green as the only encoding** — fails ~8% of male viewers; add shape/label/position.
- **3D anything** — perspective distortion + occlusion; never.
- **Too many series** on one line/area chart — past ~5 it's spaghetti; small-multiple or highlight one.
- **No zero baseline on bars** (and forcing zero on lines) — opposite errors; know which channel you're using.
- **Decoration over clarity** — gradients, shadows, mascots, icon-filled bars; chartjunk that lowers data-ink.
- **Chart where a table or number belongs** — precise-lookup data → table; single value → big number.
- **Encoding magnitude as area/bubble radius** — area is rank 5 and radius∝value squares the distortion; size by √value or use bars.
- **Unsorted bars** — comparison charts should be sorted by value unless the axis has a natural order.
- **Choropleth of raw counts** — normalize to a rate, or you've drawn a population map.

## Reference sources
- **Cleveland & McGill** (1984) — graphical perception ranking of visual channels.
- **Tufte** — data-ink ratio, chartjunk, Lie Factor, small multiples, sparklines, slopegraphs.
- **Munzner** — *Visualization Analysis & Design*: matching channels to attribute importance.
- **Few** (*Show Me the Numbers*, *Information Dashboard Design*) — dashboard hierarchy, bullet graphs, decluttering.
- **Shneiderman** — visual information-seeking mantra; brushing & linking.
- **Okabe-Ito / ColorBrewer (Brewer & Harrower)** — colorblind-safe palettes and sequential/diverging/categorical scale theory.
