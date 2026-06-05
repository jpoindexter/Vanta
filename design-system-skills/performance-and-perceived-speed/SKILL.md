---
name: performance-and-perceived-speed
description: Reference-grade guide to performance as a UX concern — Core Web Vitals (LCP/INP/CLS with concrete budgets and fixes), perceived-performance technique (optimistic UI, skeletons vs spinners, instant feedback, prefetch on intent), loading-state and image/font design, and field-vs-lab measurement at p75.
tags: [design-systems, performance, core-web-vitals, perceived-speed]
---
# Performance & Perceived Speed (a UX concern)

Speed is not an engineering metric that happens after design — it is a design material. Every layout decision, image choice, font load, and interaction reserves or spends a latency budget the user feels. Treat performance like contrast or hierarchy: a property you design for, measure, and defend.

## Why performance IS UX

Latency is the most consistent driver of conversion, trust, and retention that exists across every product category.

- **Conversion.** Walmart, Amazon, and Akamai studies converge: every additional 100ms of latency measurably depresses conversion; pages crossing ~3s see bounce rates climb sharply (Google: bounce probability rises ~32% as load goes 1s→3s, ~90% by 5s).
- **Trust.** Users equate speed with competence and security. A janky, shifting, slow UI reads as "unfinished" or "unsafe" regardless of actual quality.
- **Retention.** Slow first sessions correlate with non-return. The first 5 seconds set the perceived quality ceiling for the whole relationship.
- **SEO.** Core Web Vitals are a Google ranking signal. Field (not lab) data, at the 75th percentile, decides pass/fail.

### Human perception thresholds (design to these, not to round numbers)

| Threshold | Feels like | Design implication |
|---|---|---|
| **0–100ms** | Instant; direct manipulation | Every tap/click/keypress MUST produce visible feedback inside this window |
| **~400ms (Doherty threshold)** | The pace at which users stay productive and engaged | Target sub-400ms for the common-case round trip; below this, usage and satisfaction rise together |
| **~1s** | Noticeable but keeps flow of thought | Keep navigation/transitions under 1s or the user's mental context starts to fray |
| **~10s** | Attention lost; user switches tasks | Beyond this, hold attention with determinate progress or abandon the synchronous model |

The Doherty threshold (IBM, 1982) is the headline: when the system responds in under 400ms, the human and machine fall into a fast feedback loop and the user does *more* work, not less. Above it, the human slows to the machine's pace.

## Core Web Vitals (the field-measured floor)

Three metrics, each with a "good / needs-improvement / poor" band. Pass = the 75th-percentile (p75) real-user value is in the "good" band. Lab tools (Lighthouse) approximate; field data (CrUX/RUM) decides.

### LCP — Largest Contentful Paint — good ≤ 2.5s

Time until the largest above-the-fold element (usually a hero image, video poster, or headline block) renders. It is a loading-perception metric, not a "fully loaded" metric.

- **Causes of bad LCP:** slow server (high TTFB), render-blocking CSS/JS, the LCP image discovered late (lazy-loaded, injected by JS, or hidden behind a CSS background), unoptimized/oversized hero image, client-side rendering that paints nothing until JS hydrates.
- **Fixes:** keep TTFB low (CDN, caching, edge); `<link rel="preload">` the LCP image with `fetchpriority="high"`; **never lazy-load the LCP image** (`loading="eager"`); inline critical CSS, defer the rest; serve the right image size via `srcset`/`sizes`; avoid client-only rendering for above-the-fold content (SSR/SSG/streaming). Make the LCP element discoverable in the initial HTML.

```html
<!-- LCP hero: discoverable, eager, prioritized, correctly sized -->
<link rel="preload" as="image" href="/hero-1280.avif" fetchpriority="high">
<img src="/hero-1280.avif"
     srcset="/hero-640.avif 640w, /hero-1280.avif 1280w, /hero-2560.avif 2560w"
     sizes="100vw" width="1280" height="720"
     loading="eager" fetchpriority="high" alt="">
```

### INP — Interaction to Next Paint — good ≤ 200ms

**INP replaced FID as a Core Web Vital in March 2024.** Where FID measured only *input delay* of the *first* interaction, INP measures the **full latency of every interaction** — input delay + processing time + presentation delay — and reports the worst (near-worst) one across the visit. It is the responsiveness metric: does the UI react when I poke it?

- **Causes of bad INP:** long JS tasks blocking the main thread (>50ms blocks), heavy event handlers, large React re-renders on input, synchronous work on click, expensive layout/style recalc, big un-virtualized lists re-rendering.
- **Fixes:** break long tasks (yield to the main thread with `await scheduler.yield()` / `setTimeout`/`isInputPending`); show feedback *before* doing work (set pending state synchronously, compute after a paint); debounce/throttle high-frequency handlers; move heavy compute to web workers; `useTransition`/`startTransition` in React to keep input responsive; virtualize long lists; avoid layout thrash (batch reads then writes). Budget: keep any single interaction's handler work under ~200ms end-to-end; aim for <50ms main-thread blocks.

```js
// Feedback first, heavy work after a paint — keeps INP low
button.addEventListener('click', () => {
  button.setAttribute('aria-busy', 'true');   // synchronous, visible next paint
  requestAnimationFrame(async () => {          // let the paint happen
    await scheduler.yield();                    // yield between chunks of work
    const result = doExpensiveWork();           // now the heavy part
    render(result);
    button.removeAttribute('aria-busy');
  });
});
```

### CLS — Cumulative Layout Shift — good ≤ 0.1

Sum of unexpected layout shifts — content jumping after it's already visible. The most *design-owned* vital: almost every cause is a missing dimension reservation.

- **Causes:** images/video/iframes without width/height (or `aspect-ratio`), ads/embeds/banners injected with no reserved slot, web fonts causing FOUT/FOIT reflow when the fallback and final font have different metrics, content inserted above existing content (cookie bars, "you may also like"), dynamically sized components that grow after load.
- **Fixes:** always set `width`/`height` attributes or `aspect-ratio` on media so the browser reserves the box; reserve fixed-size slots for ads/embeds/skeletons; **skeletons must match the final layout's dimensions** so swap-in causes zero shift; control font swap with `font-display: optional` or `swap` plus `size-adjust`/`@font-face` metric overrides (`ascent-override`, `descent-override`, `size-adjust`) to match fallback metrics; never insert content above the fold after paint; use `min-height` on containers that fill asynchronously; trigger user-driven expansions with `transform`, not layout.

```css
/* Reserve the box before content arrives → zero CLS */
.media   { aspect-ratio: 16 / 9; width: 100%; }      /* image/video slot */
.ad-slot { min-height: 250px; }                       /* reserve ad space */
@font-face {                                          /* fallback matches metrics */
  font-family: "Brand"; src: url(/brand.woff2) format("woff2");
  font-display: optional; size-adjust: 102%;
  ascent-override: 90%; descent-override: 22%;
}
```

### Supporting metrics (lab-side diagnostics)

- **TTFB — Time To First Byte — good < 800ms.** Server + network latency before any byte arrives. High TTFB caps every downstream metric. Fix with CDN/edge, caching, faster backend, reduced redirects.
- **FCP — First Contentful Paint — good < 1.8s.** First pixel of content. Improved by reducing render-blocking resources and TTFB.
- **TTI — Time To Interactive.** When the page reliably responds to input. Driven by JS execution; the gap between FCP and TTI is the "looks ready but isn't" trap — visually painted, functionally frozen.

## Perceived performance (often matters more than actual)

Users don't have stopwatches; they have feelings. A 2s wait *with* immediate feedback and a skeleton feels faster than a 1s wait staring at a frozen, unresponsive UI. Engineer the *perception*, not only the milliseconds.

### Optimistic UI

Update the interface immediately as if the action succeeded, then reconcile with the server in the background.

- **When:** high-success-rate, reversible actions — like/favorite, send message, add to cart, toggle, reorder, mark-done.
- **How:** apply the change to local state on interaction (0ms perceived), fire the request, on success do nothing visible, on failure roll back and surface a non-destructive error ("Couldn't send — tap to retry").
- **Don't** use optimistic UI for low-success or irreversible/financial actions (payments, deletes with real consequences) — there, show honest pending state.

```jsx
// React 19: optimistic update reconciles automatically on settle/error
const [optimistic, addOptimistic] = useOptimistic(messages, (cur, m) => [...cur, m]);
async function send(text) {
  addOptimistic({ text, pending: true });   // instant, 0ms perceived
  try { await api.send(text); }             // reconciles with real state on resolve
  catch { toast('Couldn't send — tap to retry'); } // auto-rolls back on throw
}
```

### Skeleton vs spinner vs progress bar — pick by duration and knowledge

| Pattern | Use when | Why |
|---|---|---|
| **Instant feedback only** (state change, ripple, button press) | < 100ms | No loader needed; just react |
| **Spinner / indeterminate** | ~100ms–1s, unknown duration, single small region | Cheap, communicates "working"; jarring if it flashes — delay showing it ~200ms so fast responses never flash a spinner |
| **Skeleton screen** | Loading *structured layout* (cards, lists, profiles), duration > ~300ms | Communicates *what* is coming and *where*; reserves space → zero CLS; feels faster than a spinner because the brain pre-loads the shape |
| **Determinate progress bar / percentage** | Known, longer operations > ~3–10s (uploads, exports, installs, multi-step jobs) | Reduces anxiety by bounding the wait; show real progress, never fake-stall at 99% |

Rule: spinners say "wait," skeletons say "here's what's coming," progress bars say "and here's how long." Match the message to the situation.

### Instant feedback on every interaction (< 100ms)

Every interactive element must acknowledge input within 100ms — button depresses, row highlights, tab switches active state — *before* the underlying work finishes. Set the pending/active state synchronously on the event, then start async work. A button that does nothing for 300ms after a click feels broken even if the result arrives quickly.

### Progressive & streamed loading

Show the most important content first; stream the rest. Server-render and stream HTML (React Server Components / streaming SSR / `Suspense`) so the user reads the headline while the comments hydrate. Render above-the-fold immediately, defer below-the-fold. Partial content beats a blank screen every time.

### Latency-masking tricks

- **Early visual response:** acknowledge before computing (see instant feedback).
- **Animation to mask latency:** a ~200–300ms transition can cover a fetch that completes within it — the motion *is* the loading state, and the work finishes "for free" behind it. Don't add motion *longer* than the work; that slows things.
- **Prefetch on intent:** preload the destination's data/route on `hover`, `mousedown`, `touchstart`, or viewport-entry — the click then resolves instantly. (`<link rel="prefetch">`, route prefetching, `IntersectionObserver`.) `hover` gives ~100–300ms of head start before the click; `mousedown` gives ~80ms but never wastes bandwidth on accidental hovers.

```js
link.addEventListener('mouseenter', () => prefetch(link.href), { once: true });
link.addEventListener('mousedown',  () => prefetch(link.href), { once: true });
```
- **Stale-while-revalidate:** render cached data instantly, fetch fresh in the background, swap in silently. The user sees content in 0ms and never a spinner on revisits.
- **Optimistic navigation:** start the transition immediately, fill content as it arrives.

## Loading states as design

Loading is a first-class screen, not an afterthought. Design the empty, loading, error, and partial states with the same care as the success state.

- **Skeletons must mirror the real layout** — same number of lines, same card grid, same image aspect ratio — so the content swap causes no shift and no surprise.
- **No layout shift on load:** the skeleton occupies the exact box the content will. Reserve every async slot.
- **Avoid skeleton soup:** for tiny or instant regions, a skeleton is overkill — just render. Reserve skeletons for structured, perceptibly-slow loads.
- **Subtle shimmer, respect motion preferences.** A gentle shimmer signals "loading," but gate it behind `prefers-reduced-motion: reduce` (cross-ref the interaction-and-motion skill).
- **Don't flash:** if data may arrive in <200ms, delay the loader so fast paths show nothing rather than a flicker of skeleton→content.

## Image & font performance as design

Media is usually the largest, most controllable performance lever — and it's a designer's call.

### Images

- **Modern formats:** prefer **AVIF** (best compression), fall back to **WebP**, then JPEG/PNG. AVIF/WebP cut bytes 30–50%+ vs JPEG at equal quality.
- **Responsive images:** ship `srcset` + `sizes` so each device downloads an appropriately sized asset — never a 2000px image into a 360px slot.
- **Lazy-load below the fold** (`loading="lazy"`); **eager-load the LCP/hero image** (`loading="eager"` + `fetchpriority="high"` + preload). Lazy-loading the hero is a classic LCP-killer.
- **Always set dimensions** (`width`/`height` or `aspect-ratio`) to prevent CLS.
- Compress aggressively; strip metadata; serve via a CDN/image pipeline that does format negotiation and resizing.

### Fonts

- **System font stack** is the fastest font: zero download, instant render. Use it when brand allows.
- **`font-display`:** `swap` (show fallback immediately, swap when ready — risk of FOUT shift) or `optional` (use fallback, only swap if the font is already cached — best for CLS). Avoid the default `block`/FOIT (invisible text up to 3s).
- **`<link rel="preload" as="font" crossorigin>`** the critical web font so it loads early.
- **Subset** fonts to the glyphs/weights you actually use; drop unused weights and languages — often 70%+ byte savings.
- **Self-host** over third-party font CDNs to cut a DNS+connection round trip and avoid third-party CLS.
- **Match fallback metrics** with `size-adjust` / `ascent-override` / `descent-override` so the swap doesn't reflow text (kills CLS from font swap).

## Reduce the work the device must do

- **Virtualize long lists** (>100 items) — render only the visible window (`react-window`/virtual). Mounting 1,000 rows wrecks INP and scroll.
- **Code-split / lazy-load routes and heavy components** so the initial bundle stays small; defer non-critical JS.
- **Debounce/throttle** high-frequency events (search-as-you-type ~150–300ms debounce, scroll/resize throttled).
- **Defer offscreen work**; `content-visibility: auto` to skip rendering offscreen sections.
- **Avoid N+1 fetches and waterfalls;** parallelize and batch requests.
- **Budget the bundle:** flag any single dependency >50KB gzipped; question it.

## Offline & poor-network UX

Assume the network is flaky, not absent-or-perfect.

- **Optimistic + queued:** accept the action locally, queue the sync, retry with backoff when connectivity returns.
- **Cache-first / stale-while-revalidate** via service worker so revisits and offline reads work.
- **Explicit offline states:** "You're offline — changes will sync when you reconnect," not a silent failure or an infinite spinner.
- **Retry affordances:** failed loads get a visible, tappable retry — never a dead end.
- **Graceful degradation:** core read paths work on a slow 3G; defer heavy assets.

## Measuring (you can't defend what you don't measure)

- **Lab vs field — know the difference.** Lab (Lighthouse, WebPageTest) = synthetic, one machine, reproducible, good for catching regressions in CI. Field/RUM (CrUX, real-user monitoring) = actual users on real devices/networks; **only field data determines Core Web Vitals pass/fail.** A green Lighthouse score with red field data means real users suffer — believe the field.
- **Measure at p75, not the average.** Averages hide the slow tail; the 75th percentile is what Google grades and what your unluckiest quarter of users actually experience. Watch p95 for the worst cases.
- **RUM in production:** ship the `web-vitals` library to collect LCP/INP/CLS from real sessions, segmented by device class and connection. Throttle to a mid-tier mobile + slow 4G when testing — not your fast laptop on fiber.

```js
import { onLCP, onINP, onCLS } from 'web-vitals';
const send = (m) => navigator.sendBeacon('/rum', JSON.stringify(m)); // device-class tagged server-side
onLCP(send); onINP(send); onCLS(send);
```

- **Set budgets and gate them in CI:** fail the build if LCP/INP/CLS or bundle size regress past thresholds.

## Animation performance (cross-ref interaction-and-motion skill)

- **Animate only `transform` and `opacity`.** These run on the compositor thread, off the main thread, and don't trigger layout or paint — so they stay at 60fps (120 on ProMotion) even when JS is busy.
- **Never animate** `width`, `height`, `top`/`left`, `margin`, `box-shadow` directly — they force layout/paint every frame and cause jank.
- Promote animating elements with `will-change: transform` sparingly (it costs memory); remove it after.
- A janky animation reads as *slow* even when the page is fast. 16.7ms per frame is the 60fps budget — exceed it and the eye sees stutter.

## Common mistakes

- **Spinner for everything** — including instant or structured loads where a skeleton (or nothing) would feel faster.
- **Layout shift from late content** — images without dimensions, ads/banners injected with no reserved slot, fonts reflowing text, cookie bars pushing content down (kills CLS).
- **No skeleton / blank screen** during structured loads — the user can't tell if it's working or broken.
- **Blocking on the network for feedback** — the button does nothing until the request returns, so the UI feels frozen (violates the <100ms rule).
- **Huge unoptimized images** — a multi-MB JPEG hero, lazy-loaded, in the wrong format, at the wrong size (kills LCP).
- **No INP budget** — heavy click handlers and giant re-renders block the main thread; the page looks done but won't respond.
- **Janky scroll** — un-virtualized lists, `scroll`/`resize` handlers doing layout work, animating layout properties.
- **Faking progress** — a progress bar that stalls at 99% or a fake percentage erodes trust faster than honest indeterminacy.
- **Trusting lab over field** — shipping on a green Lighthouse score while real users on mid-tier Androids fail every vital.
- **Lazy-loading the LCP image** — the single most common self-inflicted LCP failure.
