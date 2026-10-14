/** Typed contract for the server's `approval.request` payload (vanta-ts/src/desktop/typed-events.ts). */

export type PermissionKind =
  'bash' | 'computer_use' | 'file_edit' | 'file_write' | 'generic' | 'sandbox' | 'skill' | 'web_fetch'

export interface PermissionSection {
  label: string
  value: string
  tone?: 'code' | 'danger' | 'muted'
}

export interface PermissionRequest {
  canRemember?: boolean
  /** True for one-way actions: asked every time, Always is never offered. */
  fresh?: boolean
  kind: PermissionKind
  reason: string
  sections: PermissionSection[]
  subject: string
  title: string
  toolName?: string
}

export interface ApprovalPayload {
  action: string
  id: string
  reason: string
  request?: PermissionRequest
  toolName?: string
}

/** What the card reports; the host maps these onto the server's allow/always/deny/never. */
export type ApprovalDecision = 'allow' | 'always' | 'deny' | 'never'

const KINDS: readonly PermissionKind[] = [
  'bash',
  'computer_use',
  'file_edit',
  'file_write',
  'generic',
  'sandbox',
  'skill',
  'web_fetch'
]

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

function parseSection(value: unknown): PermissionSection | null {
  const section = record(value)

  if (!section || typeof section.label !== 'string' || typeof section.value !== 'string') {
    return null
  }

  const tone = section.tone

  return {
    label: section.label,
    tone: tone === 'code' || tone === 'danger' || tone === 'muted' ? tone : undefined,
    value: section.value
  }
}

/** Narrow an untrusted permission request (the server's `request` / `vanta_request`); undefined when absent. */
export function parsePermissionRequest(value: unknown): PermissionRequest | undefined {
  const request = record(value)

  if (!request) {
    return undefined
  }

  const kind = KINDS.find(item => item === request.kind) ?? 'generic'
  const sections = Array.isArray(request.sections) ? request.sections : []

  return {
    canRemember: request.canRemember === true,
    fresh: request.fresh === true,
    kind,
    reason: text(request.reason),
    sections: sections.map(parseSection).filter((section): section is PermissionSection => section !== null),
    subject: text(request.subject),
    title: text(request.title),
    toolName: typeof request.toolName === 'string' ? request.toolName : undefined
  }
}

/** Narrow an untrusted `approval.request` payload; null when it lacks an id and an action. */
export function parseApprovalPayload(value: unknown): ApprovalPayload | null {
  const payload = record(value)

  if (!payload || typeof payload.id !== 'string' || typeof payload.action !== 'string') {
    return null
  }

  return {
    action: payload.action,
    id: payload.id,
    reason: text(payload.reason),
    request: parsePermissionRequest(payload.request),
    toolName: typeof payload.toolName === 'string' ? payload.toolName : undefined
  }
}
