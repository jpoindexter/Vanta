import { JsonRpcGatewayError } from '@vanta/shared'
import { z } from 'zod'

import { requireClient } from './handlers-prompt'
import type { Handler } from './handlers-session'
import { expectOk, parseBody } from './rpc'
import { statusSchema } from './schemas'

const MAX_LOCAL_FILE_BYTES = 16 * 1024 * 1024
const pathText = z.string().min(1).max(4096).refine(value => !/[\u0000-\u001f\u007f\\]/.test(value), 'Invalid attachment path.')
const absolutePath = pathText.refine(value => value.startsWith('/') && !value.startsWith('//'), 'A local absolute path is required.')
const attachmentParams = z.object({ session_id: z.string().min(1), path: pathText, name: pathText.optional() }).strict()
const directoryResult = z.object({ entries: z.array(z.object({ path: absolutePath })), error: z.string().optional() })
const fileResult = z.object({ path: absolutePath, byteSize: z.number().int().nonnegative(), binary: z.boolean(), text: z.string().max(512 * 1024), truncated: z.boolean() })
const canonical = (value: string) => '/' + value.split('/').filter(part => part && part !== '.').join('/')
const parentOf = (value: string) => value.slice(0, value.lastIndexOf('/')) || '/'
function reject(message: string): never {
  throw new JsonRpcGatewayError(message, { code: 400 })
}

function nativeReader() {
  const bridge = typeof window === 'undefined' ? undefined : window.desktopBridge
  if (!bridge?.vanta || !bridge.readDir || !bridge.readFileText) reject('Local native file validation is unavailable in this window.')
  return bridge!
}

function projectTarget(root: string, requested: string): string {
  if (requested.split('/').includes('..') || /^[a-z][a-z0-9+.-]*:/i.test(requested)) reject('Choose a file inside this conversation project.')
  const target = canonical(requested.startsWith('/') ? requested : `${root}/${requested}`)
  if (!target.startsWith(`${root}/`)) reject('That attachment is outside this conversation project.')
  return target
}

async function confirmFile(native: ReturnType<typeof nativeReader>, target: string): Promise<void> {
  const read = await native.readFileText(target)
  if ('ok' in read && read.ok === false) reject(read.message || 'The selected file could not be read.')
  const confirmed = fileResult.safeParse(read)
  if (!confirmed.success || canonical(confirmed.data.path) !== target) reject('The selected file path could not be confirmed.')
  if (confirmed.data.byteSize > MAX_LOCAL_FILE_BYTES) reject('Local file attachments must be 16 MiB or smaller. Choose a smaller file.')
}

/** Link an existing project file. No upload, content extraction, wider read grant, or agent action occurs here. */
export const fileAttach: Handler = async (hub, raw) => {
  if ('data_url' in raw) reject('File byte uploads are not supported by this local Vanta attachment route.')
  const params = attachmentParams.safeParse(raw)
  if (!params.success) reject('Choose a valid local project file; attachment paths cannot contain control characters.')
  const native = nativeReader()
  const client = requireClient(hub, raw)

  const confirmRoot = async () => {
    // Unlike refreshInfo's display fallback, this operation must never retain an unverified cached cwd.
    const status = parseBody(statusSchema, expectOk(await hub.caller.get(client, '/api/status'), 'Attachment project'), 'Attachment project')
    const parsed = absolutePath.safeParse(status.root)
    if (!parsed.success || parsed.data.split('/').includes('..')) reject('The attachment project root could not be established.')
    const root = canonical(parsed.data)
    if (root === '/' || hub.registry.get(client.clientId) !== client) reject('The attachment project changed; choose the file again.')
    const listing = directoryResult.safeParse(await native.readDir('.'))
    // readDir has no root field: a nonempty immediate-child listing is the existing native root evidence.
    if (!listing.success || listing.data.error || !listing.data.entries.length ||
      listing.data.entries.some(entry => parentOf(canonical(entry.path)) !== root)) reject('The native file reader and conversation project roots do not match.')
    return root
  }

  const root = await confirmRoot()
  const target = projectTarget(root, params.data!.path)
  await confirmFile(native, target)
  if (await confirmRoot() !== root) reject('The attachment project changed; choose the file again.')
  client.cwd = root
  const relative = target.slice(root.length + 1)
  const reference = /^[\w./-]+$/u.test(relative) ? relative : JSON.stringify(relative)
  return { attached: true, uploaded: false, native_reference: true, path: target, ref_path: relative, ref_text: `@${reference}` }
}
