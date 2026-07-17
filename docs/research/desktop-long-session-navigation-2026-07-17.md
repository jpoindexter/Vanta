# Desktop long-session navigation receipt

Date: 2026-07-17
Roadmap card: `DESKTOP-LONG-SESSION-NAVIGATION`

## Shipped behavior

- The Work transcript uses measured virtualization so a 500-turn fixture preserves its full scroll range while rendering fewer than 80 message rows at once.
- A bounded 32-marker prompt map samples the complete conversation, jumps to user turns, and exposes the full prompt through an accessible label.
- Reading position and follow state persist per session through task switches and full Electron relaunches. Restoration uses a semantic turn anchor plus pixel offset so dynamic row measurement does not overwrite the saved location.
- Wheel, touch, Page Up, Arrow Up, Home, and Shift-Space explicitly detach the reader. Passive layout shifts and streamed output do not.
- `Latest` or `New messages` appears only while detached and returns to the live edge on demand. Reduced-motion preference changes prompt jumps from smooth to immediate scrolling.
- Compact mode hides the prompt map without reducing transcript reach or keyboard navigation.

## Kernel isolation recovery

The proof exposed a separate lifecycle defect: desktop automation used persistent project-scoped kernels for temporary fixture roots. Those orphan processes could later own the same stable project port and trigger `Project context needs attention` during startup.

Automation now receives a unique free kernel endpoint. Kernels launched with `VANTA_KERNEL_EPHEMERAL=1` are tied to the owning runtime and terminate on normal exit, `SIGINT`, or `SIGTERM`. Persistent operator kernels keep their existing behavior. Seventy-three confirmed orphan kernels whose temporary fixture directories no longer existed were retired; real project kernels were excluded.

## Executed verification

```text
npx vitest run src/kernel-launcher.test.ts
npx vitest run desktop-app/src/session-view-state.test.ts desktop-app/src/long-session-navigation.test.tsx desktop-app/src/chat.test.tsx desktop-app/src/state.test.ts
npm run typecheck
npm run desktop:renderer:typecheck
npm run desktop:long-session:smoke
npm run desktop:pack
VANTA_DESKTOP_APP=release/mac-arm64/Vanta.app/Contents/MacOS/Vanta node scripts/desktop-long-session-navigation-smoke.mjs
npm run desktop:flow:proof
npm test -- --run
```

Both source and locally signed packaged Electron targets returned `ok: true` for 500 turns, 21 rendered rows, 32 prompt markers, task-switch and relaunch restoration, detached streaming, wheel/touch/keyboard input, 1440x960, 1024x640, and 760x700 viewports, reduced motion, and measured virtualization.

The integrated desktop flow receipt also returned `ok: true` for both targets after running shell convergence, work recovery, long-session navigation, context attachments, safe session operations, and Outputs/Connect. The repository suite passed 13,307 tests in 1,392 files with three skipped.

After each source and packaged run, a live process/status scan found zero kernels owned by a temporary desktop fixture root. This proves local automation cleanup; it does not change or terminate persistent kernels for real Vanta projects.
