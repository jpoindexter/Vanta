/**
 * Does this zone show its tab strip? One resolver, one precedence order, so
 * every caller gets the same answer and the rule can be read in one place.
 *
 * The decision used to be an inline expression in TreeGroup fed by a flag four
 * other code paths also wrote to, which is how a zone could end up with no
 * strip, no tab, no ✕ and no menu to get any of them back. The ladder below is
 * the whole policy; nothing outside `mode` is persisted, so a zone's chrome is
 * a function of what it currently holds plus one deliberate choice.
 */

import type { Contribution } from '@/contrib/types'
import { effectiveTabStripMode } from '@/store/tabstrip-prefs'

import type { TabStripMode } from '../model'

import { paneChrome } from './track-model'

export interface StripPane {
  /** A tool panel (terminal / logs) that collapses rather than closes. */
  collapsePane: boolean
  /** Contribution placement — `'main'` marks a docked tile (session, page,
   *  preview) as opposed to standing side chrome. */
  placement?: string
  /** Panes that never leave the tree (the workspace). */
  uncloseable?: boolean
}

export interface StripZone {
  /** The ACTIVE pane declines to be tabbed (a full-page view). */
  headerVeto?: boolean
  /** The zone's standing choice; undefined = auto. */
  mode?: TabStripMode
  /** Panes currently rendered as chips — chrome-hidden and narrow-collapsed
   *  panes are already filtered out. */
  shown: readonly StripPane[]
}

/**
 * A pane is STRANDED without a strip when the strip is the only thing carrying
 * its handle: a lone tool panel needs a chip to grab, and a lone closeable
 * tile needs its ✕ and +. The lone WORKSPACE is not stranded any more: the
 * titlebar owns its title, its rename/pin/archive menu and the new-chat button,
 * so a single chat shows no strip and the strip appears once a second tab
 * exists (⌘1…⌘9 and tab cycling need it then). Hide-only chrome (sessions) is
 * different again: the panes stay, Show/Hide is a separate verb, and a hidden
 * strip comes back via ⌘⌥T.
 *
 * This outranks an explicit `never` on purpose. "Hide the strip" is a request
 * about chrome, never a request to make a surface unreachable, so a lone tool
 * panel or closeable tile keeps its chip.
 */
function stranded(shown: readonly StripPane[]): boolean {
  if (shown.length !== 1) {
    return false
  }

  const [only] = shown

  return only.collapsePane || (only.placement === 'main' && !only.uncloseable)
}

export function resolveTabStripVisible(zone: StripZone): boolean {
  if (zone.shown.length === 0) {
    return false
  }

  // A page is not a tab-able surface. Contextual and self-lifting: the strip
  // returns with the chat, so it is resolved ahead of any stored choice and
  // never written down.
  if (zone.headerVeto) {
    return false
  }

  if (stranded(zone.shown)) {
    return true
  }

  if (zone.mode) {
    return zone.mode === 'always'
  }

  // Auto: two or more panes need a strip to switch between them. A lone main
  // tile never reaches here (it is stranded above), so what is left alone is
  // standing side chrome, which goes without.
  return zone.shown.length > 1
}

/**
 * Resolve a zone straight from what the layout knows about it. Both callers —
 * TreeGroup from its render inputs, the store from the registry — go through
 * here, so neither can drift on which chrome flags feed the answer or forget to
 * fold in the app-wide default.
 */
export function tabStripVisibleForZone(zone: {
  /** The zone's ACTIVE pane. */
  active: string
  isCollapsePane: (id: string) => boolean
  /** The zone's own choice, before the app default applies. */
  mode: TabStripMode | undefined
  paneFor: (id: string) => Contribution | undefined
  /** Panes currently rendered as chips. */
  shown: readonly string[]
}): boolean {
  return resolveTabStripVisible({
    headerVeto: paneChrome(zone.paneFor(zone.active)).headerVeto,
    mode: effectiveTabStripMode(zone.mode),
    shown: zone.shown.map(id => {
      const chrome = paneChrome(zone.paneFor(id))

      return {
        collapsePane: zone.isCollapsePane(id),
        placement: chrome.placement,
        uncloseable: chrome.uncloseable
      }
    })
  })
}
