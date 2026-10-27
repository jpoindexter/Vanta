import { draftAddress } from '../../../shared/src/vanta/draft-custody'

/** Preserve only the bounded preparation intent; legacy text-submit drafts remain unchanged. */
export function homeAttachmentIntent(value: unknown) {
  const input = value as { intent?: unknown; owner?: unknown }
  if (input.intent === undefined) return undefined
  if (input.intent !== 'prepare-attachment') throw new Error('The new chat intent is invalid.')
  const owner = draftAddress({ owner: input.owner, session: '__new__' }).owner
  return Object.freeze({ intent: 'prepare-attachment' as const, owner: Object.freeze({ ...owner }) })
}
