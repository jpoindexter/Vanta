---
name: interaction-and-motion
description: Reference-grade motion and micro-interaction system — duration scales, easing tokens, choreography, modern CSS (view transitions, scroll-driven, @starting-style, linear()), performance, and accessibility for any screen on any platform.
tags: [design-systems, motion, animation, micro-interactions, interaction]
---
# Interaction & Motion

Motion is not decoration. Every animation answers a question the user is silently asking — *Did that work? Where did this come from? What's happening now? What's most important?* If a motion can't be tied to **feedback, orientation, status, hierarchy, or earned delight**, cut it. Gratuitous motion is latency you chose to add.

## Why motion exists (pick one before you animate)

| Purpose | What it answers | Example |
|---|---|---|
| **Feedback** | "Did my action register?" | Button press depress, toggle slide, ripple |
| **Orientation / continuity** | "Where did this come from / go?" | Shared-element transition, sheet slides up from the bar that opened it |
| **Status** | "What is the system doing?" | Spinner, progress bar, skeleton shimmer, syncing pulse |
| **Hierarchy** | "What should I look at?" | Stagger reveals primary content first; the FAB scales in last |
| **Delight** | "This product has care" | Confetti on success, a spring on a like — **rare, earned, skippable** |

Rule: if you can't name the purpose, you have a bug, not a feature.

## Duration scale

Tie duration to **distance, size, and importance**, not taste. Bigger/farther = longer. Enter slower than exit (entrances orient; exits get out of the way).

| Token | Duration | Use |
|---|---|---|
| `--motion-instant` | 50–100ms | Hover tints, pressed states, color/opacity swaps |
| `--motion-fast` | 150–200ms | Toggles, checkboxes, small icon swaps, tooltips |
| `--motion-base` | 250–300ms | Most UI: dropdowns, popovers, tab/content swaps, cards |
| `--motion-slow` | 350–450ms | Modals, sheets, drawers, page-level transitions |
| `--motion-slower` | 450–600ms | Full-screen transitions, hero/onboarding, large travel |

**Perception thresholds** (Nielsen): **~100ms** feels instant (direct manipulation budget). **~1s** keeps flow of thought unbroken — anything under 1s needs no loader, just motion. **>1s** needs a progress indicator or the user assumes a freeze. Keep most UI transitions in the **200–300ms** band; under 150ms reads as a glitch, over 500ms reads as sluggish.

```css
:root {
  --motion-instant: 80ms;  --motion-fast: 180ms;  --motion-base: 260ms;
  --motion-slow: 400ms;    --motion-slower: 550ms;
}
```

> Asymmetry: a menu opens at `--motion-base` (260ms, ease-out) and closes at `--motion-fast` (180ms, ease-in). The user already knows what's there — get it offscreen.

## Easing

Easing communicates physics and intent. **Linear is for nothing physical** (use it only for continuous loops like spinners and progress). Real objects accelerate and decelerate.

| Curve | `cubic-bezier` | Feel | Use |
|---|---|---|---|
| **ease-out** (decelerate) | `cubic-bezier(0, 0, 0.2, 1)` | Fast start, soft landing | **Default for entrances** — element arrives & settles. Most UI. |
| **ease-in** (accelerate) | `cubic-bezier(0.4, 0, 1, 1)` | Slow start, fast exit | **Exits** — element leaves screen, speeds away |
| **ease-in-out** (standard) | `cubic-bezier(0.4, 0, 0.2, 1)` | Smooth both ends | On-screen moves: reordering, expanding, position shifts |
| **emphasized** (Material 3) | `cubic-bezier(0.2, 0, 0, 1)` | Snappy, expressive | Hero moments, signature transitions |
| **sharp** | `cubic-bezier(0.4, 0, 0.6, 1)` | Quick in/out | Temporary elements that may reverse (snackbars) |

```css
:root {
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-emphasized: cubic-bezier(0.2, 0, 0, 1);
}
```

**Direction is the #1 easing mistake.** Entrances with `ease-in` feel like they stutter then snap; exits with `ease-out` feel like they drag and stick. Enter = ease-**out**. Exit = ease-**in**. Memorize it.

### Springs and `linear()`

Springs feel natural because they overshoot and settle like real mass. The modern CSS `linear()` function approximates any curve — including spring bounce — by sampling points, so you get spring feel in plain CSS transitions (Chrome/Edge/FF/Safari 17.4+):

```css
/* A gentle spring: tiny overshoot then settle — generate via tools like linear-easing-generator */
:root {
  --spring-bounce: linear(0, 0.006, 0.025, 0.101, 0.539, 0.826, 0.949, 1.001, 1.04, 1.011, 0.997, 1);
}
.chip { transition: transform var(--motion-base) var(--spring-bounce); }
```

Spring physics (Framer Motion / Motion / SwiftUI / Android) are tuned by **stiffness** (higher = faster, snappier), **damping** (higher = less bounce; critical damping = no overshoot), and **mass** (higher = more sluggish/heavy). Defaults that read well: stiffness `170–300`, damping `20–30`. Springs are **duration-less** — they settle when physics says so — which makes interruptible, gesture-driven motion feel right. Prefer springs for drag, drag-release, and anything the user can grab.

## Micro-interactions

Anatomy (Dan Saffer): **Trigger → Rules → Feedback → Loops/Modes**. Trigger = what starts it (tap, hover, system event). Rules = what happens. Feedback = the visible/audible/haptic response. Loops/modes = what happens over time or on repeat.

| Interaction | Trigger | Feedback | Numbers |
|---|---|---|---|
| Button press | pointerdown | scale 0.97 + darken | 80ms ease-out, spring back on release |
| Toggle | tap | knob slides + track color | 180ms ease-in-out |
| Like / favorite | tap | scale-pop + color + particle burst | spring, stiffness 300 / damping 18 |
| Pull-to-refresh | drag past threshold | indicator rotates with drag, snaps + spins | follows finger, decouples on release |
| Input focus | focus | border color + label float | 150ms; never animate width/height |
| Tooltip | hover (after delay) | fade + 4px rise | 150ms; 400–600ms hover delay first |

The "1%" details: pressed states that depress, hover delays so tooltips don't flicker on pass-through, the loading button that morphs into a checkmark, the input border that eases instead of snapping. Users don't notice these individually — they notice their absence as "cheap."

## Choreography & the animation principles

Multiple elements moving at once need **orchestration**, not chaos.

- **Stagger** — reveal list items in sequence, ~30–50ms apart, capped so a 50-item list doesn't take 2.5s (stagger first ~6, then snap the rest). Directs the eye and implies order.
- **Sequence vs parallel** — sequence when one thing causes another (sheet slides up, *then* its content fades in); parallel when things are peers. Don't sequence what could be parallel; it just feels slow.
- **Follow-through & overlap** — secondary elements settle slightly after the primary (the card lands, its shadow catches up a beat later). Springs do this for free.
- **Anticipation** — a tiny counter-move before the main move (a button dips 1px before launching a value) signals intent.
- **Staging** — animate the thing that matters; freeze the rest. If everything moves, nothing is emphasized.
- **Secondary action** — supporting motion (icon rotates as a panel expands) that reinforces without competing.

Map to Disney's 12: **slow-in/slow-out = easing**, **follow-through/overlapping = stagger+spring settle**, **anticipation = pre-move**, **staging = focus**, **secondary action = supporting motion**, **timing = duration scale**. These are the load-bearing five for UI.

## Patterns (copy-paste)

**Enter on insert with `@starting-style`** (animate from `display:none`/popovers/dialogs — no JS):
```css
.toast {
  transition: opacity var(--motion-base) var(--ease-out),
              transform var(--motion-base) var(--ease-out),
              overlay var(--motion-base) allow-discrete,
              display var(--motion-base) allow-discrete;
  opacity: 1; transform: translateY(0);
}
@starting-style { .toast { opacity: 0; transform: translateY(8px); } }
.toast[hidden] { opacity: 0; transform: translateY(8px); } /* exit */
```

**View Transitions API** (cross-document & SPA shared-element morphs):
```css
@view-transition { navigation: auto; } /* same-origin MPA, opt-in */
.card { view-transition-name: hero; }  /* same name on both pages → morph */
::view-transition-old(hero), ::view-transition-new(hero) {
  animation-duration: var(--motion-slow); animation-timing-function: var(--ease-emphasized);
}
```
```js
// SPA: wrap the DOM mutation; browser snapshots before/after and tweens.
if (document.startViewTransition) document.startViewTransition(() => updateDOM());
else updateDOM(); // graceful fallback
```

**Scroll-driven reveal** (runs on the compositor, no scroll listeners, no jank):
```css
@keyframes reveal { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; } }
.section {
  animation: reveal linear both;
  animation-timeline: view();          /* progresses as element crosses viewport */
  animation-range: entry 0% cover 35%;
}
```

**FLIP for list add/remove/reorder** — animate layout cheaply: measure **F**irst rect, apply **L**ast (post-DOM) rect, **I**nvert via `transform` to look unmoved, then **P**lay by removing the transform with a transition. Animates `transform` only, never `top`/`height`. The Web Animations API or `getBoundingClientRect()` drives it; many libs (Motion's `layout`, AutoAnimate) wrap it.

**Modal / sheet:** backdrop fades (200ms), panel slides+scales from origin (`scale(0.96)→1`, `translateY(12px)→0`, 350ms ease-out). Exit reverses faster (200ms ease-in). Trap focus; animate `transform/opacity`, never `width/height`.

**Loading:** spinner if **<1s expected & indeterminate**; **skeleton** if you know the layout (shimmer 1.2–1.5s linear loop, low contrast); **progress bar** if measurable; **optimistic UI** if you can predict success — apply the change instantly, reconcile on response, animate a graceful revert on failure.

**Number ticker:** roll digits or interpolate value over ~400–800ms ease-out; respect reduced-motion by snapping. **Parallax:** subtle (background moves 10–30% of foreground), tasteful, and a top vestibular-trigger — gate behind reduced-motion.

## Performance

Animate only **`transform` and `opacity`**. They run on the **compositor** thread — no layout, no paint, GPU-cheap, 60fps (16.7ms/frame budget) even under main-thread load.

| Cheap (composite) | Expensive — avoid animating |
|---|---|
| `transform` (translate/scale/rotate) | `width`, `height`, `top`, `left`, `margin`, `padding` → **layout** |
| `opacity` | `box-shadow`, `background`, `color`, `border-radius` → **paint** |
| `filter` (GPU, moderate) | `box-shadow` spread on scroll → worst offender |

- Replace `width`/`height` animations with `transform: scale()`. Replace `top`/`left` with `translate()`. Animate a shadow via an `::after` pseudo whose `opacity` you fade.
- `will-change: transform` **only just before** an animation, remove after — it allocates a GPU layer and is a footgun if left on dozens of elements.
- Promote sparingly; thousands of layers thrash the GPU. Profile in DevTools **Performance / Layers**; watch for purple (layout) and green (paint) bars during animation — you want none.
- Jank causes: animating layout props, long main-thread tasks blocking frames, huge repaint regions, synchronous layout reads inside rAF, oversized images decoding mid-transition.

## Accessibility — non-negotiable

`prefers-reduced-motion` is a real user setting (vestibular disorders, migraine, nausea, motion sickness). Honor it. **Reduce, don't remove** — keep instant opacity/color feedback so the UI still confirms actions; kill travel, parallax, spin, scale, and autoplay.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important; scroll-behavior: auto !important;
  }
}
/* Better: a deliberate reduced variant per component — cross-fade instead of slide. */
@media (prefers-reduced-motion: no-preference) { .panel { transition: transform var(--motion-base) var(--ease-out); } }
```

Rules: no information conveyed **only** by motion (pair with text/icon/color). Anything autoplaying/looping >5s must be **pausable, stoppable, hideable** (WCAG 2.2.2). Avoid flashes >3/sec (seizure risk). Don't trap users in a long unskippable transition. Test with the OS "Reduce Motion" toggle on.

## Implementation toolkit

| Tool | Reach for it when |
|---|---|
| **CSS transitions** | State changes (hover, toggle, open/close). Default. |
| **CSS keyframes** | Loops, multi-step, entrances; `@starting-style` for enter-from-nothing |
| **Web Animations API** | JS-driven, dynamic values, FLIP, fine timeline control, `.cancel()`/`.reverse()` |
| **View Transitions API** | Shared-element + page transitions (MPA & SPA) |
| **Scroll-driven (CSS)** | Reveals, progress bars, parallax — off the main thread |
| **Motion / Motion One** | Tiny (~5kb) spring + WAAPI wrapper, vanilla or React |
| **Framer Motion (motion/react)** | React: `layout` (auto-FLIP), gestures, springs, `AnimatePresence` exit anims |
| **GSAP** | Complex timelines, scrubbing, broad legacy support, sequencing |

Platform: **iOS** — `UIView.animate`/`UIViewPropertyAnimator` (interruptible), SwiftUI `withAnimation(.spring())`, `.interactiveSpring` for gestures; system uses spring-by-default. **Android** — `MotionLayout`/`ConstraintSet`, `SpringAnimation`/`DynamicAnimation`, Compose `animate*AsState`/`updateTransition`; Material Motion patterns (container transform, shared axis, fade-through).

Cross-device: touch wants **interruptible, finger-tracking** motion (springs shine; gestures must reverse mid-flight); pointer can afford hover micro-interactions touch can't. Mind low-end devices — keep concurrent animations low, lean on the compositor, and let reduced-motion + lower frame budgets degrade gracefully.

## Common mistakes (the do/don't)

| Don't | Do |
|---|---|
| Animate everything | Animate what carries meaning; freeze the rest |
| 500ms+ on routine UI | 200–300ms; reserve long durations for large travel |
| Sub-100ms transitions (glitchy) | Floor most transitions at ~150ms |
| `ease-in` on entrances / `ease-out` on exits | ease-**out** in, ease-**in** out |
| `linear` on physical motion | linear only for spinners/progress loops |
| Animate `width`/`height`/`top`/`left` | `transform: scale()` / `translate()` |
| Leave `will-change` on permanently | Add right before, remove right after |
| Same duration in and out | Exit faster than enter |
| Ignore `prefers-reduced-motion` | Ship a reduced variant, keep instant feedback |
| Info conveyed only via motion | Pair with text/icon/color |
| Gratuitous "delight" everywhere | Earn it; make it skippable; use it once |
| Stagger an entire 50-item list | Cap stagger to the first few, snap the rest |

**Golden test:** turn the animation off. If the UI is now confusing or feels broken, the motion was load-bearing — keep it. If nothing is lost, you were decorating — cut it.
