import { Codecs, persistentAtom } from '@/lib/persisted'
import { modeBound } from '@/store/interface-mode'

// The hidden-item set is versioned so a change of defaults reaches existing installs.
const STATUSBAR_HIDDEN_STORAGE_KEY = 'vanta.desktop.statusbarHidden.v3'
// v4: the bar is back and visible by default (the Vanta shell briefly rested it
// hidden). Earlier keys are not seeded from, so every install sees it once.
const STATUSBAR_VISIBLE_STORAGE_KEY = 'vanta.desktop.statusbarVisible.v4'

// Whole-bar visibility, VS Code's `workbench.statusBar.visible`. On by default.
// Hiding it unmounts the bar (its 15s status poll goes with it), so the way back
// is the More menu, the `view.toggleStatusbar` keybind or the ⌘K row, never the
// bar itself. Simple mode rests the bar hidden without touching
// this preference.
const $statusbarVisiblePref = persistentAtom(STATUSBAR_VISIBLE_STORAGE_KEY, true, Codecs.bool)

export const $statusbarVisible = modeBound('statusbarVisible', $statusbarVisiblePref, value =>
  $statusbarVisiblePref.set(value)
)

export function toggleStatusbarVisible() {
  $statusbarVisible.set(!$statusbarVisible.get())
}

// Items the bar hides until the user turns them on from its context menu: only the
// two throughput diagnostics. Everything else the Hermes bar carried is on.
export const STATUSBAR_HIDDEN_BY_DEFAULT: readonly string[] = ['cache-hit-rate', 'tokens-per-second']

// Stored as the explicit hidden set (not the visible one) so an item added to
// the bar in a later version shows up for existing users instead of silently
// staying off. An empty array is a real value — the user turned everything on —
// so this uses a sanitizing json codec rather than Codecs.stringArray, which
// drops the key when empty and would resurrect the defaults on next launch.
const sanitizeHiddenIds = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : []

export const $statusbarHiddenIds = persistentAtom<string[]>(
  STATUSBAR_HIDDEN_STORAGE_KEY,
  [...STATUSBAR_HIDDEN_BY_DEFAULT],
  Codecs.json<string[]>(sanitizeHiddenIds)
)

export function setStatusbarItemVisible(id: string, visible: boolean) {
  const hidden = $statusbarHiddenIds.get()

  if (visible === !hidden.includes(id)) {
    return
  }

  $statusbarHiddenIds.set(visible ? hidden.filter(entry => entry !== id) : [...hidden, id])
}

/** Pure so the menu can derive its reset row's disabled state from the hidden
 *  list it already subscribes to, rather than reading the atom out of band.
 *  Set-compared: order is incidental (items are appended as they're hidden) and
 *  a duplicated id shouldn't read as a customization. */
export function isStatusbarLayoutDefault(hidden: readonly string[]) {
  const ids = new Set(hidden)

  return ids.size === STATUSBAR_HIDDEN_BY_DEFAULT.length && STATUSBAR_HIDDEN_BY_DEFAULT.every(id => ids.has(id))
}

/** Put the show/hide set back to what ships. Only touches item layout — whole-bar
 *  visibility is a separate preference, and resetting from the bar's own menu
 *  shouldn't make the bar the user is right-clicking disappear. */
export function resetStatusbarLayout() {
  $statusbarHiddenIds.set([...STATUSBAR_HIDDEN_BY_DEFAULT])
}
