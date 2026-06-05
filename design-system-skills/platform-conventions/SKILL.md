---
name: platform-conventions
description: Reference guide to native UI conventions across iOS (Apple HIG), Android (Material 3), macOS, Windows 11 Fluent, and web — with concrete numbers, comparison tables, and when to adapt vs. when to ship a custom cross-platform brand system.
tags: [design-systems, platforms, ios, android, desktop, hig, material]
---
# Platform Conventions — iOS, Android, macOS, Windows, Web

A platform convention is a contract the OS already taught the user. SF Symbols, the back-swipe, the FAB, the menu bar — these are muscle memory, not decoration. When you honor them your app feels native and invisible; when you fight them you spend the user's attention re-teaching things they already know. This skill is the cross-platform bible: what each platform expects, the exact numbers, and the trade-off of when to break with convention on purpose.

The recurring decision in every section below is the same: **inherit the platform's pattern (cheaper, familiar, accessible-by-default) or impose your own (coherent, branded, but you pay to re-teach and re-implement).** Read each platform's section as the catalog of what you get for free if you conform, so you know exactly what you're spending when you don't.

## Why respect conventions — and when not to

**Respect them when:** the value is in the content/task, not the chrome (productivity, utility, system-adjacent apps); you want App Store / Play Store reviewer goodwill; your users span ability levels (native controls inherit accessibility for free); you're a small team that can't afford to re-solve solved problems.

**Use a custom cross-platform brand system when:** the brand *is* the product (games, creative tools, immersive media, strongly-branded consumer apps like Spotify/Notion/Linear); a consistent identity across platforms outweighs per-platform familiarity; you control onboarding enough to teach novel patterns. Spotify, Discord, and Figma deliberately look identical everywhere — that consistency is the point.

**The trade-off, stated plainly:** Native = lower learning cost, free accessibility, store goodwill, but per-platform engineering and a fragmented brand. Custom = one design language and brand coherence, but you re-implement accessibility, you fight platform reflexes (back gesture, share sheet), and stores scrutinize you harder. The mature answer is almost always *hybrid*: a shared brand token layer (color, type scale, spacing, motion personality) with **platform-native navigation, controls, and gestures**. Never ship an iOS app that looks Android, or vice versa — that's the one thing users universally read as "cheap port."

**Store reality:** Apple's App Store Review Guidelines reject apps that feel like a "repackaged website" or ignore platform paradigms (§4.0 Design); Apple expects you to use system controls, the native share sheet, and standard navigation. Google Play is more permissive on UI but still rejects on broken back behavior, deceptive patterns, and accessibility failures. Conforming isn't only good UX — it materially lowers rejection risk and speeds review.

---

## iOS — Apple Human Interface Guidelines (iOS 17 / 18)

**Type:** SF Pro (SF Pro Text < 20pt, SF Pro Display ≥ 20pt; New York is the serif). **Dynamic Type is mandatory** — use the 11 text styles (LargeTitle 34, Title1 28, Title2 22, Title3 20, Headline 17 semibold, Body 17, Callout 16, Subhead 15, Footnote 13, Caption1 12, Caption2 11). Never hardcode point sizes for body content; users set their own scale (xSmall→AX5), and respecting it is an accessibility requirement, not an option.

**Touch & grid:** Minimum tap target **44×44 pt** (HIG hard floor). Layout on an **8 pt grid** (4 pt for fine tuning). Standard screen margin 16–20 pt. Points are density-independent; the system rasterizes @1x/@2x/@3x.

**Navigation:**
- **Navigation bar** (top): back chevron + title, large titles collapse to inline on scroll. Back is always **top-left** + an **edge-swipe-from-left** gesture — never remove either.
- **Tab bar** (bottom): 2–5 destinations, flat top-level sections, persistent. iOS 18 adds a floating/morphing tab bar and (iPad) a tab bar that converts to a sidebar.
- **Sheets / modals:** prefer **sheets** (slide up, support detents — `.medium`/`.large`, drag-to-dismiss grabber) over full-screen modals. Use full-screen cover only for self-contained tasks. Action sheets for destructive choices anchored to context.

**System feel:**
- **Safe areas** (notch / Dynamic Island / home indicator): pin to `safeAreaInsets`, never the raw screen rect.
- **Haptics** via `UIFeedbackGenerator` (selection / impact / notification): expected on toggles, pickers, and success/error moments.
- **Materials & blur:** `.ultraThinMaterial`→`.thickMaterial` vibrancy for bars, popovers, sidebars — don't fake translucency with a flat alpha fill.
- **Light/dark:** semantic colors (`.label`, `.systemBackground`, `.separator`), never hardcoded hex.
- **Accessibility:** respect Reduce Motion and Increase Contrast; ship VoiceOver labels.

**Standard components — reach for these first:** `UIDatePicker` (wheel/compact/inline), segmented control, stepper, switch (green capsule), context menus (long-press), swipe actions on rows, and the **system share sheet** (`UIActivityViewController`) — never roll your own share UI.

**iPadOS** is its own interaction model, not a big iPhone:
- **Three-column split view** (`UISplitViewController`: sidebar / supplementary / secondary) collapses to a stack on iPhone-width.
- **Popovers anchored to their source** for transient content — not full-height sheets.
- **Pointer / trackpad** support: the cursor morphs into controls, hover effects, and precise hit-testing — design hover states.
- **Hardware keyboard:** key-command HUD on ⌘-hold; support standard shortcuts.
- **Multitasking:** Split View, Slide Over, Stage Manager — your layout must survive arbitrary window sizes via regular/compact **size classes**.
- First-class **drag-and-drop** between apps.

**visionOS basics:** content lives on glass material in 3D space; default window 1280×720 pt at 1m; targets ≥60 pt for eye+pinch; hover highlight is system-driven; put tab bars/toolbars in **ornaments** rather than screen-edge chrome.

**iOS do / don't:**
- **Do** put the most important destination switching in a bottom tab bar; keep it 2–5 items, persistent, flat.
- **Do** use large titles that collapse on scroll for top-level screens; inline titles for pushed detail screens.
- **Do** preserve the left-edge back-swipe — if you build a custom transition, keep the interactive pop gesture alive.
- **Don't** add a hamburger drawer, a FAB, or a bottom snackbar — those are Android signatures and read as foreign.
- **Don't** put primary actions at the bottom-center as a floating circle; put them top-right in the nav bar or in a toolbar.
- **Don't** hardcode `17pt`; use the Body text style so Dynamic Type and accessibility sizes flow through.

---

## Android — Material Design 3 (Material You)

**Type:** Roboto (or Roboto Flex) is the default; brand fonts allowed. Type scale tokens: Display L/M/S, Headline L/M/S, Title L/M/S, Body L/M/S (Body Large 16sp), Label L/M/S. **Units are `sp` for text** (scales with user font setting) and **`dp` for everything else.** Using `dp` for text is a bug — it ignores accessibility font scaling.

**Dynamic color (Material You):** M3's signature — the system extracts a tonal palette from the user's **wallpaper** and exposes it via color-role tokens (`primary`, `onPrimary`, `primaryContainer`, `surface`, `surfaceContainerHighest`, `outline`…). Design against **roles**, not raw hex, so your app re-themes itself per device. Provide a static brand fallback for when dynamic color is off.

**Touch & grid:** Minimum target **48×48 dp** (8 dp larger than iOS). **8 dp grid**, **4 dp** for fine spacing/icon padding. Default screen margins 16 dp.

**Navigation:**
- **Top app bar** (small / center-aligned / medium / large) — title + nav icon (hamburger or up-arrow) + actions, scrolls with `surfaceContainer` color shift.
- **Navigation bar** (bottom): 3–5 destinations, pill-shaped active indicator behind the icon.
- **Navigation rail** (≥600 dp width) and **navigation drawer** (modal or standard) for larger screens / many destinations. The hamburger drawer is *acceptable* on Android in a way it is not on iOS.
- **FAB:** the single most-important screen action, bottom-right; sizes small/standard(56 dp)/large/extended. Distinctly Android — there is no FAB on iOS.

**Surfaces & state:**
- **Tonal elevation:** M3 expresses height primarily as a lighter, primary-tinted surface color (`surfaceContainerLow`→`surfaceContainerHighest`) rather than only a shadow.
- **State layers:** hover/focus/pressed/dragged add a translucent `onSurface` overlay (8% / 10% / 10% / 16%).
- **Ripple** radiates from the touch point on every pressable — its absence makes the UI feel dead.
- **Bottom sheets** (modal/standard) and **snackbars** (transient, bottom, one optional action — *not* a dialog) are the Android counterparts to iOS sheets/alerts.
- **Adaptive layouts** by window size class (Compact <600 / Medium 600–840 / Expanded ≥840 dp) drive list ↔ list-detail panes.

**Motion durations (M3 tokens):** short 50–200 ms (state changes, small components) · medium 250–400 ms (most container transitions) · long 450–600 ms (large/full-screen) · extra-long 700–1000 ms (hero moments). Easing is **emphasized** (`emphasizedDecelerate`/`emphasizedAccelerate`, ~`cubic-bezier(0.05,0.7,0.1,1)`) with container-transform and shared-axis transitions. For contrast: iOS motion is **spring-based** (no fixed duration ramp, ~0.3–0.5 s defaults, mass/stiffness/damping); Fluent sits ~150–300 ms.

**Android do / don't:**
- **Do** rely on the **system back** (gesture or button) — you rarely need a per-screen back affordance; up-arrow only for hierarchical "up," which is not the same as back.
- **Do** design against **color roles** and ship a dynamic-color theme + a static brand fallback.
- **Do** use a FAB for the one defining action, a snackbar for transient feedback, and a bottom sheet for contextual options.
- **Do** add ripple + state layers to every pressable; their absence makes the app feel dead/un-Android.
- **Don't** copy iOS's green capsule switch, wheel date picker, or top-left chevron back — use Material's switch, calendar/dial pickers, and system back.
- **Don't** size text in `dp` — it silently ignores the user's font-scale setting.

---

## iOS vs. Android — the head-to-head

| Dimension | iOS (HIG) | Android (Material 3) |
|---|---|---|
| Primary navigation | **Tab bar** (bottom, 2–5) | **Navigation bar** (bottom, 3–5) / rail / drawer |
| "Back" | Top-left chevron **+ edge-swipe** | System back (gesture / button); no per-screen back needed |
| Hamburger menu | Avoid — un-iOS | Acceptable (navigation drawer) |
| Primary screen action | Top-right bar button | **FAB** (bottom-right) |
| Modal pattern | **Sheet** with detents, drag-to-dismiss | **Bottom sheet** / full-screen dialog |
| Alert / transient msg | Alert + **action sheet** | **Dialog** + **snackbar** |
| Type unit | **pt** (Dynamic Type styles) | **sp** (text) / **dp** (layout) |
| Min touch target | **44 pt** | **48 dp** |
| Grid | 8 pt (4 fine) | 8 dp (4 fine) |
| Icon style | **SF Symbols** — thin, rounded, optically sized | **Material Symbols** — geometric, fill/weight/grade axes |
| Switch | Green capsule, no label inside | Track + thumb with checkmark, role-colored |
| Date picker | Wheel / compact / inline calendar | Calendar dialog / docked / dial time picker |
| Share | **System share sheet** (`UIActivityViewController`) | **Android Sharesheet** (`ACTION_SEND`) |
| Settings | Inside the app (Settings.app for system perms) | In-app + system Settings deep links |
| Color theming | Semantic system colors, vibrancy | **Dynamic color** from wallpaper (tonal roles) |
| Elevation | Materials / blur layering | **Tonal** elevation + shadow + state layers |

**Cardinal sins:** an iOS-looking app on Android (and vice versa) reads as a low-effort port. The most damaging are: a top-left back button on Android (use system back), a FAB on iOS, a hamburger drawer on iOS, hardcoded font sizes that ignore Dynamic Type / `sp`, custom non-native date pickers, and a bespoke share screen instead of the OS share sheet.

---

## macOS (Sonoma / Sequoia)

**Density is the headline difference from iOS** — pointer precision means smaller, denser controls (min ~28 pt clickable, not 44), tighter rows, more affordances visible at once. **Don't ship an iPad app stretched to a window.**

- **Menu bar** (global, top of screen): the canonical home for *every* command — App / File / Edit / View / Window / Help plus app menus. If a command isn't in a menu, it's not discoverable and not keyboard-reachable. Mirror toolbar actions here.
- **Toolbar:** customizable, lives in the window title bar (unified in modern macOS); icon + optional label buttons for frequent actions.
- **Sidebar:** primary navigation (source list) with translucency/**vibrancy**; collapsible; sections + disclosure groups.
- **Window chrome:** traffic-light controls top-left, resizable, full-screen and Stage Manager aware. Support **multiple windows** and tabs; state restoration on relaunch.
- **Pointer affordances:** **hover** states, **right-click / Control-click context menus** everywhere, cursor changes (resize, text I-beam, link pointer). These don't exist on touch — design them in, not as an afterthought.
- **Keyboard:** full shortcut coverage with standard bindings (⌘C/V/Z, ⌘W close, ⌘, Preferences, ⌘N new). Tab moves focus; everything operable without a mouse.

**macOS do / don't:**
- **Do** put every command in the menu bar (even ones also in a toolbar) so it's keyboard-reachable and discoverable.
- **Do** support multiple resizable windows + tabs and restore window state on relaunch.
- **Do** design hover, right-click, and cursor-change states — pointer affordances are first-class here.
- **Don't** ship a touch-density iPad layout with 44 pt targets stretched across a window.
- **Don't** hide commands only behind toolbar icons or omit standard ⌘-shortcuts; Mac users navigate by keyboard and menu.

---

## Windows 11 — Fluent Design (WinUI 3 / WinAppSDK)

- **Type:** **Segoe UI Variable** (Display/Text/Small optical sizes); type ramp Caption 12 → Body 14 → Subtitle 20 → Title 28 → Display 68.
- **Materials:** **Mica** (opaque, wallpaper-tinted, for the base window background) and **Acrylic** (translucent, blurred, for transient/layered surfaces — flyouts, command bars). Mica is the modern default for app backgrounds.
- **Shape:** rounded corners — **8 px** on windows/cards/flyouts, **4 px** on small controls. A flat square-cornered window reads as legacy Win32.
- **Navigation:** **NavigationView** — left pane that auto-adapts (expanded ↔ compact rail ↔ overflow) by width; **breadcrumb bar** for hierarchy; **TabView** for documents.
- **Commands:** **CommandBar** (primary actions + overflow `…`), context menus, and the right-click menu.
- **Theme:** full light/dark + the system-wide **accent color** the user picks — tint with it.
- **Density:** a Compact spacing variant exists for data-dense apps.
- **Input:** must work for **mouse, touch, pen, and gamepad** — ~40×40 px touch targets, hover/focus visuals for mouse and pen.

**Windows do / don't:** **Do** use Mica for the window base, Acrylic for flyouts/menus, rounded corners, and the system accent color. **Don't** ship flat square-cornered surfaces with hard shadows (reads as legacy Win32), and don't assume mouse-only — Surface devices are touch + pen.

---

## Web — borrow patterns, respect the wrapper

The web has **no single OS convention** — so you inherit the *browser's* contract (back/forward, the URL, Ctrl/⌘+F, zoom, reader mode, text selection) and the **WCAG** baseline, then layer your own design language. Don't break browser back, don't hijack scroll, keep links as links.

**The wrapper rule:** the moment your web UI is packaged, the host platform's conventions reassert themselves:
- **Electron / Tauri (desktop):** honor the menu bar (macOS global menu vs. Windows in-window menu), native window controls, OS keyboard shortcuts, light/dark, and platform-correct titlebar. A web app in a window that ignores ⌘-shortcuts feels broken.
- **PWA / mobile web:** respect safe-area insets (`env(safe-area-inset-*)`), `theme-color`, the install/standalone display mode, and touch target sizes (≥44 px). On iOS Safari, account for the dynamic toolbar (`100dvh` not `100vh`).
- **Responsive:** users expect fluid reflow across breakpoints (mobile / tablet / desktop), no horizontal scroll, and touch-friendly hit areas on small screens. This is itself a convention — violate it and the site feels broken.

---

## Cross-platform strategy

**Keep consistent (the brand layer):** design tokens (color roles, type scale ratios, spacing scale, radius, motion personality), content/voice, information architecture, iconography family, illustration. These travel.

**Adapt per platform (the experience layer):** navigation structure (tab bar vs. nav bar vs. menu bar), control appearance (switches, pickers, buttons), gestures (back-swipe, long-press vs. right-click), typography *units* (pt/sp/dp/px) and the system font, share/print/settings hooks, density, and the elevation/material model. These must be native.

**Worked example — one "compose new message" feature, five platforms.** Same brand color, type ramp, and copy throughout; the *behavior* is native each time:
- **iOS:** a top-right "compose" bar button (or a prominent toolbar button) opens a **sheet** with detents; recipients use the native contact picker; send confirmation is a subtle haptic.
- **Android:** a **FAB** (bottom-right) opens a full-screen compose; a **snackbar** confirms "Message sent" with an Undo; back is the system gesture.
- **macOS:** **⌘N** and a `File ▸ New Message` menu item open a **new window**; the toolbar holds Send; right-click a recipient for actions.
- **Windows:** a **CommandBar** "New" button opens a compose pane in an Acrylic flyout; Send is a primary command; Ctrl+N works too.
- **Web:** a button opens a modal/route; the browser back button closes it; ⌘/Ctrl+Enter sends.
One feature, one brand — five correct platform expressions. That is the whole strategy in miniature.

**Framework caveats:**
- **React Native / Flutter:** ship one codebase but you must still branch behavior — RN's `Platform.select`, Flutter's Cupertino vs. Material widget sets. "Write once, run anywhere" with one UI = uncanny on at least one platform. Budget for platform-specific navigation and controls.
- **Compose Multiplatform:** Material-first; you own re-creating an iOS look if you want native feel there — it won't be automatic.
- **Catalyst / SwiftUI multiplatform:** closer to free adaptation, but density and pointer affordances on Mac still need explicit attention.
- **Ionic / Capacitor (web in a native shell):** you get one web UI everywhere — acceptable for content/utility apps, but you must still respect safe areas, hardware back on Android, and the system share sheet, or it feels like a website in a frame.

---

## Accessibility per platform

Native controls inherit most of this for free — another reason to conform. If you build custom, you re-implement all of it.

| Platform | Screen reader | Text scaling | Other expected |
|---|---|---|---|
| iOS / iPadOS | **VoiceOver** | **Dynamic Type** (text styles) | Reduce Motion, Increase Contrast, Bold Text, Switch Control, Voice Control; min contrast WCAG AA |
| Android | **TalkBack** | system **font scale** (use `sp`) | Switch Access, color-inversion, large-touch, content descriptions on every control |
| macOS | **VoiceOver** | system text size, hover text | **Full Keyboard Access**, Increase Contrast, Reduce Motion, focus rings |
| Windows 11 | **Narrator** | system text scaling | High Contrast themes, keyboard nav, focus visuals, UI Automation patterns |
| Web | platform SR (VoiceOver / NVDA / Narrator) | browser zoom + rem/`em` | **WCAG 2.2 AA**, semantic HTML, ARIA only when HTML can't, visible focus, reduced-motion query |

**The throughline:** every platform exposes a user-chosen text scale and a screen reader. Hardcoded sizes and unlabeled custom controls break both — the single most common accessibility regression across all five.

## Icons & assets per platform

| Platform | App icon | In-UI icons | Notes |
|---|---|---|---|
| iOS / iPadOS | **1024×1024** single master (Xcode generates the rest); rounded-rect mask applied by OS — supply a **square**, no pre-rounded corners | **SF Symbols** (vector, weight + scale matched to text) | Don't bake the corner radius; provide light/dark/tinted variants (iOS 18) |
| Android | **Adaptive icon**: 108×108 dp = 72 dp safe zone, separate **foreground + background** layers (system masks to circle/squircle/etc.); Play Store **512×512** | **Material Symbols** (fill/weight/grade/optical-size axes) | Never a single flat PNG — adaptive layers or it clips wrong |
| macOS | **1024×1024**, rounded-square with subtle depth (squircle), supply full `.icns` set | SF Symbols + custom template images | More skeuomorphic depth than iOS flat |
| Windows 11 | App icon at multiple sizes (16→256 px) + tile/Store assets; rounded modern style | **Fluent / Segoe Fluent Icons** | Provide unplated + plated variants |
| Web / PWA | `favicon` set + **512×512** + **maskable** icon (safe zone for masking) + apple-touch-icon 180×180 | SVG sprite or icon font | Maskable icon prevents Android cropping |

---

## Common mistakes (quick scan)

- iOS-style UI on Android or Android-style on iOS — instant "cheap port."
- Custom navigation that breaks the **system back** (Android) or **edge-swipe back** (iOS).
- Ignoring **safe areas** / notch / home indicator / dynamic toolbar.
- Hardcoded font sizes that ignore **Dynamic Type (iOS)** or **`sp` (Android)**.
- A **hamburger menu on iOS**, or a **FAB on iOS** — both are Android idioms.
- Rolling your own **share sheet, date picker, or alert** instead of the system component.
- Hardcoded colors instead of **semantic / role tokens** → broken dark mode and no dynamic color.
- macOS app that's just a stretched iPad layout — no menu bar, no right-click, no density.
- Square-cornered, shadow-only, non-Mica Windows app that looks like Win32.
- Touch targets under 44 pt / 48 dp; no hover/focus states on pointer platforms.
- Faking blur with flat alpha instead of real **materials/vibrancy/Acrylic**.
- Breaking browser **back/forward**, scroll, or text selection on the web.

**The one rule:** ship the brand once, ship the *behavior* native. Tokens are shared; navigation, controls, and gestures belong to the platform.
