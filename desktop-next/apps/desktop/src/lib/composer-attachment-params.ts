import { hasVantaBridge } from '@/api/vanta/bridge-transport'
import type { ComposerAttachment } from '@/store/composer'

import { promptImageParams } from './composer-images'

function nativeFileReference(item: ComposerAttachment): string {
  const raw = item.refText?.startsWith('@') ? item.refText.slice(1) : ''
  const path: unknown = raw.startsWith('"') ? JSON.parse(raw) : raw
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.split('/').includes('..') ||
    /^[a-z][a-z0-9+.-]*:/i.test(path) || /[\u0000-\u001f\u007f\\]/.test(path)) {
    throw new Error('The local file reference is not ready. Reattach the file before sending.')
  }
  return path
}

/** Native local file references accompany images; legacy gateways keep their existing staging contract. */
export function promptAttachmentParams(attachments: readonly ComposerAttachment[]) {
  const files = hasVantaBridge()
    ? [...new Set(attachments.flatMap(item => item.kind === 'file' && item.path ? [nativeFileReference(item)] : []))]
    : []
  return { ...promptImageParams(attachments), ...(files.length ? { files } : {}) }
}
