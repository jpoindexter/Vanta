import { useEffect } from 'react'

import { captureLook, type LookImage, type LookMode } from '@/api/look'
import { COMPOSER_AREAS } from '@/app/chat/composer/contrib'
import { requestComposerAttachImages } from '@/app/chat/composer/focus'
import { registry } from '@/contrib/registry'
import { notifyError } from '@/store/notifications'

interface LookEntry {
  label: string
  mode: LookMode
}

const LOOK_ENTRIES: readonly LookEntry[] = [
  { label: 'Capture selection', mode: 'marquee' },
  { label: 'Capture window', mode: 'window' },
  { label: 'Capture screen', mode: 'screen' }
]

const FAILED = "Couldn't capture the screen."

/** The server answers errors as "403: <recovery text>"; the person should read only the recovery text. */
export function lookErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)

  return text.replace(/^\s*\d{3}:\s*/, '').trim() || FAILED
}

export function imageToBlob(image: LookImage): File {
  const bytes = Uint8Array.from(atob(image.dataBase64), char => char.charCodeAt(0))

  return new File([bytes], image.name, { type: image.mime })
}

/** Takes one capture and puts it on the composer as an image attachment. Cancelling does nothing. */
export async function captureIntoComposer(mode: LookMode): Promise<void> {
  try {
    const result = await captureLook(mode)

    if (result.status === 'captured') {
      requestComposerAttachImages(result.images.map(imageToBlob))
    }
  } catch (error) {
    notifyError(new Error(lookErrorMessage(error)), FAILED)
  }
}

/** Adds the three capture rows to the composer's "+" menu for as long as the app is mounted. */
export function useLookCaptureEntries(): void {
  useEffect(() => {
    const disposers = LOOK_ENTRIES.map((entry, index) =>
      registry.register({
        area: COMPOSER_AREAS.attachments,
        data: { icon: 'device-camera', label: entry.label, run: () => captureIntoComposer(entry.mode) },
        id: `vanta.look.${entry.mode}`,
        order: 900 + index
      })
    )

    return () => disposers.forEach(dispose => dispose())
  }, [])
}
