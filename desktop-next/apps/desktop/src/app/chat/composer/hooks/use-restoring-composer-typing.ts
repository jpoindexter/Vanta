import { useEffect, useLayoutEffect, useRef } from 'react'

import { usePaneVisible } from '@/components/pane-shell/pane-visibility'
import { stashSessionDraft, takeSessionDraft } from '@/store/composer'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { isActivePrimary } from '@/store/gateway'
import { $activeGatewayProfile } from '@/store/profile'
import { $connection, getSessionOwnerHint, knownSessionOwner, ownerLookupSessionRows } from '@/store/session'
import { isWatchWindow } from '@/store/windows'

import { $floatingComposerOwner } from '../floating-state'
import { type ComposerTarget, getVisibleComposerSurfaceId, onComposerFocusRequest } from '../focus'
import { placeCaretEnd, RICH_INPUT_SLOT } from '../rich-editor'
import { type ComposerScope, useComposerScope } from '../scope'

interface RestoringComposerTypingOptions {
  enabled: boolean
  sessionKey: null | string
  surfaceId: null | string
  target: ComposerTarget
}

const ambientRoute = () => JSON.stringify([
  $connection.get()?.connectionId, $connection.get()?.mode, $activeGatewayProfile.get()
])

function ownsSurface(surfaceId: string, target: ComposerTarget): boolean {
  const floating = $floatingComposerOwner.get()
  return (!floating || floating.id === surfaceId) && getVisibleComposerSurfaceId(target) === surfaceId
}

function restoreCapturedCaret(surfaceId: string): void {
  const editor = document.activeElement
  if (!(editor instanceof HTMLElement) || editor.dataset.slot !== RICH_INPUT_SLOT) return
  if (editor.closest<HTMLElement>('[data-composer-owner]')?.dataset.composerOwner === surfaceId) placeCaretEnd(editor)
}

type DraftOwner = NonNullable<ReturnType<typeof captureDraftCustodyOwner>>

function isPrimaryLocalDraftOwner(owner: DraftOwner): boolean {
  return owner.connectionId === 'local' && $connection.get()?.mode === 'local' && isActivePrimary()
}

function hasDraftOwnerEvidence(session: string, scope: ComposerScope, owner: DraftOwner): boolean {
  if (scope.connectionId && scope.profile) return true
  if (getSessionOwnerHint(session, owner)) return true
  const known = knownSessionOwner(ownerLookupSessionRows(), session)
  // A legacy primary-profile row proves draft custody, not a concrete RPC
  // route. Never promote this evidence into a persisted session owner hint.
  if (typeof known === 'string') return known === owner.profile && isPrimaryLocalDraftOwner(owner)
  return Boolean(known && known.connectionId === owner.connectionId &&
    (known.targetProfile || known.profile) === owner.profile)
}

function retainsDraftOwner(session: string, scope: ComposerScope, owner: DraftOwner): boolean {
  return JSON.stringify(captureDraftCustodyOwner(session, scope)) === JSON.stringify(owner) &&
    hasDraftOwnerEvidence(session, scope, owner)
}

/** A loading conversation owns these edits, not a window-wide keyboard queue.
 * Its ordinary draft restore paints them once the editor can actually mount. */
export function useRestoringComposerTyping(options: RestoringComposerTypingOptions): void {
  const { enabled, sessionKey, surfaceId, target } = options
  const visible = usePaneVisible()
  const scope = useComposerScope()
  const owner = captureDraftCustodyOwner(sessionKey, scope)
  const identified = Boolean(owner && sessionKey && hasDraftOwnerEvidence(sessionKey, scope, owner))
  const route = ambientRoute()
  const identity = JSON.stringify([sessionKey, surfaceId, target, owner, route])
  const generation = JSON.stringify([enabled, visible, identity, identified])
  const current = useRef(generation)
  const typed = useRef<null | string>(null)
  current.current = generation

  useLayoutEffect(() => {
    if (!enabled || !visible || !sessionKey || !surfaceId || !owner || !identified || isWatchWindow()) return
    // The draft store treats whitespace-only drafts as empty. Retain an initial
    // space locally until a nonblank edit can persist it with the same owner.
    let leadingSpace = ''
    return onComposerFocusRequest(({ target: requested, typeChar, source }) => {
      if (source !== 'unbound-key' || !typeChar || requested !== target || current.current !== generation) return
      if (!ownsSurface(surfaceId, target) || ambientRoute() !== route) return
      // Owner atoms may change before React commits their next render.
      if (!retainsDraftOwner(sessionKey, scope, owner)) return
      const saved = takeSessionDraft(sessionKey, owner)
      const text = saved.text + leadingSpace + typeChar
      leadingSpace = text.trim() ? '' : text
      stashSessionDraft(sessionKey, text, saved.attachments, owner)
      typed.current = identity
    })
  }, [generation])

  // Descendant draft restore and autofocus run before this parent effect. A
  // portal's detached mount may otherwise leave its restored caret at zero.
  // Never take focus from a control the person selected while waiting.
  // eslint-disable-next-line no-restricted-syntax -- consumes a captured input token, not a mirrored atom
  useEffect(() => {
    if (!typed.current || (enabled && typed.current === identity)) return
    const captured = typed.current
    typed.current = null
    if (captured !== identity || !visible || !surfaceId || !ownsSurface(surfaceId, target)) return
    restoreCapturedCaret(surfaceId)
  }, [generation])
}
