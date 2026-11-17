import { draftAddress } from '../../../shared/src/vanta/draft-custody'

/** Preserve only the bounded preparation intent; legacy text-submit drafts remain unchanged. */
export function homeAttachmentIntent(value: unknown) {
  const input = value as { intent?: unknown; owner?: unknown; source?: unknown }
  if (input.intent === undefined) return undefined
  if (input.intent !== 'prepare-attachment' && input.intent !== 'submit-home') throw new Error('The new chat intent is invalid.')
  const owner = draftAddress({ owner: input.owner, session: '__new__' }).owner
  const source = homeSource(input.source)
  if (input.intent === 'submit-home' && !source) throw new Error('The Home source is missing.')
  return Object.freeze({ intent: input.intent, owner: Object.freeze({ ...owner }), ...(source ? { source } : {}) })
}

function homeSource(value: unknown) {
  if (value === undefined) return undefined
  const source = value as { window?: unknown; revision?: unknown }
  if (typeof source?.window !== 'string' || !/^(main|window:[a-f0-9-]{36}|volatile:[a-f0-9-]{36})$/.test(source.window) ||
      typeof source.revision !== 'string' || !/^[a-f0-9-]{36}$/.test(source.revision)) throw new Error('The Home source is invalid.')
  return Object.freeze({ window: source.window, revision: source.revision })
}
