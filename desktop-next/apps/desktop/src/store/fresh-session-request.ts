import { atom } from 'nanostores'
import type { NewChatWorkspaceTarget } from './session'

export interface FreshSessionDraftOptions {
  preserveRoute?: boolean
  replaceRoute?: boolean
  rotateFreshDraftKey?: boolean
  restoreFreshDraft?: boolean
  workspaceTarget?: NewChatWorkspaceTarget
}

export const $freshSessionRequest = atom(0)
export const $restoreFreshDraftRequest = atom(false)

export function requestFreshSession(restoreDraft = false): void {
  $restoreFreshDraftRequest.set(restoreDraft)
  $freshSessionRequest.set($freshSessionRequest.get() + 1)
}
