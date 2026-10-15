import type { ApprovalPayload, PermissionKind, PermissionSection } from './approval-types'

export interface ApprovalSummary {
  details: PermissionSection[]
  headline: string
  lede: string
  preview?: { label: string; text: string }
}

const PREVIEW_LABELS = ['Preview', 'Command']

// Sections the headline already says; repeating them is extraneous load.
const REDUNDANT_LABELS: Partial<Record<PermissionKind, string[]>> = {
  file_edit: ['Target file', 'Change'],
  file_write: ['Target file', 'Write mode'],
  web_fetch: ['Target']
}

function hostOf(value: string): string {
  try {
    return new URL(value).host || value
  } catch {
    return value
  }
}

function headlineFor(kind: PermissionKind, subject: string, title: string | undefined, action: string): string {
  switch (kind) {
    case 'file_edit':
      return `Edit ${subject}`

    case 'file_write':
      return `${/^overwrite/i.test(action) ? 'Overwrite' : 'Write'} ${subject}`

    case 'bash':
      return 'Run a command'

    case 'web_fetch':
      return `Open ${hostOf(subject)}`

    case 'computer_use':
      return 'Control your computer'

    case 'sandbox':
      return 'Run code'

    case 'skill':
      return 'Save a skill'

    default:
      return title?.replace(/\s*permission request$/i, '').trim() || action
  }
}

function previewFor(
  kind: PermissionKind,
  subject: string,
  headline: string,
  sections: PermissionSection[]
): ApprovalSummary['preview'] {
  const found = sections.find(section => PREVIEW_LABELS.includes(section.label))

  if (found) {
    return { label: found.label, text: found.value }
  }

  if (kind === 'web_fetch' && subject !== hostOf(subject)) {
    return { label: 'Address', text: subject }
  }

  if (kind === 'generic' && subject && subject !== headline) {
    return { label: 'Action', text: subject }
  }

  return undefined
}

function ledeFor(reason: string, headline: string): string {
  const trimmed = reason.trim()

  if (!trimmed) {
    return ''
  }

  const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)

  if (sentence.toLowerCase().replace(/\W/g, '') === headline.toLowerCase().replace(/\W/g, '')) {
    return ''
  }

  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
}

/** The exact action in one headline, one sentence of reason, and the preview worth showing. */
export function summarizeApproval(approval: ApprovalPayload): ApprovalSummary {
  const request = approval.request
  const kind = request?.kind ?? 'generic'
  const subject = (request?.subject || approval.action).trim()
  const sections = request?.sections ?? []
  const headline = headlineFor(kind, subject, request?.title, approval.action)
  const preview = previewFor(kind, subject, headline, sections)
  const hidden = new Set([...(REDUNDANT_LABELS[kind] ?? []), ...(preview ? [preview.label] : [])])

  return {
    details: sections.filter(section => !hidden.has(section.label)),
    headline,
    lede: ledeFor(request?.reason ?? approval.reason, headline),
    preview
  }
}
