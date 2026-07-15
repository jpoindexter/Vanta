# Vanta Desktop Demo Design Engineering Audit

Date: 2026-07-14
Artifact: `docs/design-refs/vanta-desktop-shell-convergence.html`
Classifier: APP UI

## Outcome

Design score: **B** (professional and coherent; production accessibility and runtime integration remain)
AI slop score: **A** (restrained workbench composition, no decorative card grid, blobs, gradients, or generic hero treatment)

The demo communicates a serious local operator workbench. The first visual anchors are the active task, the approval boundary, and the run activity inspector. The shell now maintains that hierarchy across desktop, compact, phone, and 320px floor widths.

## Design Principles Applied

- **Core principles / cognitive load:** Four durable destinations, one central transcript, and contextual tools absorb product complexity through progressive disclosure.
- **AI-native patterns:** The active run exposes status, Background, Stop, approval, checkpoint feedback, receipts, and Undo.
- **Nielsen / Norman:** Persistent session actions, immediate state feedback, Escape, focus return, and explicit recovery close execution and evaluation gaps.
- **Gestalt / Rams:** Proximity and alignment establish relationships without decorative cards; the accent is reserved for current state and primary actions.
- **Accessibility:** Semantic controls, persistent labels, no nested interactive controls, focus containment, state attributes, reduced motion, and 24px minimum rendered controls.
- **Responsive design:** Persistent panes become overlays, then a labeled bottom navigation; the composer and send action remain usable at 320px.

## Findings And Fixes

### F-01 High: Narrow-window navigation had no usable signifiers

Before, three 24x4 marks represented Projects, Work, and Tools. They were not recognizable and were far below target-size guidance.

Fixed with a labeled three-destination bottom navigation, 46px targets, active state, and `aria-pressed` state.

Evidence: `screenshots/before-phone.png` -> `screenshots/after-phone.png`, `screenshots/after-floor-320.png`.

### F-02 High: Model selection looked like unrelated floating buttons

Model rows sized themselves to their content, which destroyed continuity and made provider comparison difficult.

Fixed with full-width grid rows, aligned model/description/status columns, a consistent active state, and a designed no-results recovery state.

Evidence: `screenshots/before-model-picker.png` -> `screenshots/after-model-picker.png`.

### F-03 High: Session management was structurally and behaviorally unreliable

The session overflow control was nested inside the session button and hidden behind hover. This breaks semantic interaction and reproduces the original rename/archive discoverability failure.

Fixed with sibling buttons, specific accessible names, persistent visibility, and verified archive plus Undo behavior.

### F-04 High: Compact titlebar controls overlapped the session header

At 1024px, the inspector track collapsed but its toolbar remained painted into a zero-width column.

Fixed by removing the duplicate toolbar below 1180px while preserving model and inspector controls in the session header and command/settings access elsewhere.

Evidence: `screenshots/after-compact.png`.

### F-05 High: The send action was clipped at the 320px floor

The page did not horizontally scroll, but two secondary composer actions consumed enough width to hide Send.

Fixed by preserving Context, removing the duplicate Commands shortcut only below 360px, and making the model control shrink predictably.

Evidence: `screenshots/after-floor-320.png`.

### F-06 Medium: Dialog focus and background state were incomplete

Fixed by marking the background inert, exposing `aria-hidden`, trapping Tab inside the open dialog, closing on Escape, and restoring focus to the opener. Escape and focus restoration were executed in the browser.

### F-07 Medium: Secondary text and form naming were too weak

Fixed the dark and light secondary text ramps and supplied persistent accessible names for session, file, model, and command search fields.

### F-08 Medium: Active agent work lacked a direct Stop path

Added Stop beside Background. The executed path changes the run status to `Run stopped - checkpoint saved` and confirms that resume remains available.

## Responsive Evidence

| Width | Result |
| --- | --- |
| 1440px | Project rail, transcript, and inspector remain docked. |
| 1024px | Project rail remains docked; inspector becomes an overlay; main width remains 733px. |
| 390px | Single work surface with labeled bottom navigation and 46px targets. |
| 320px | No page overflow; composer is 300px wide; Send remains fully visible. |

Dark and light appearances were both rendered. Light mode uses the intended light color scheme rather than a simple inversion.

## Executed Interaction Evidence

- Work -> Operate -> Outputs -> Connect route changes.
- Stop run -> checkpoint feedback.
- Session actions -> Archive -> Undo -> task restored.
- Model search -> no results -> recovery message.
- Dialog Escape -> closed -> focus returned to Change session model.
- New Task -> instruction -> Create and run -> title/composer handoff.
- Projects and Tools bottom navigation on a 320px window.
- Browser console errors: none observed.

## Remaining Production Gaps

1. The prototype is a standalone HTML behavior model, not the Electron renderer.
2. VoiceOver, 200% text scaling, forced-colors, and measured WCAG contrast still require manual production verification.
3. The model list is illustrative; production must discover provider models and availability dynamically.
4. Avenir Next is appropriate for the macOS concept but production needs an explicit bundled-font or platform-font policy.
5. Production should move these behaviors into tested components and add Playwright visual regression snapshots.

## Product Metrics

North Star: percentage of desktop tasks that reach a verified result without leaving the work surface.
HEART task-success signals: first instruction time, approval completion, Stop recovery, output verification, and session-management success.
Performance budgets: visible response under 100ms for local controls, INP <=200ms, CLS <=0.1.

## Goodwill

Goodwill: **85/100**

- +10: active work and approval are immediately visible.
- +5: target, model, and execution location are explicit before sending.
- +5: Stop, Undo, receipts, and focus return make recovery predictable.
- -5: the prototype model catalog is not live provider truth.
