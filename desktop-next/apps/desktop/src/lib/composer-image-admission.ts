import type { ComposerAttachment } from '@/store/composer'
import { type ImageReadResult, imageFromBlob, imageFromDataUrl, validateComposerImage } from './composer-images'
import { readDesktopFileDataUrlLocalFirst } from './desktop-fs'
import { downscaleDataUrlForPreview } from './image-resize'

interface LoadedChipImage {
  preview: Pick<ComposerAttachment, 'previewUrl' | 'thumbnailUrl'>
  read: ImageReadResult
}

/** Native picks belong to this machine; remote project paths fall back to the existing routed reader. */
export async function attachmentPreviewDataUrl(filePath: string): Promise<string> {
  return readDesktopFileDataUrlLocalFirst(filePath)
}

let attachmentPreviewQueue = Promise.resolve()

async function queuedAttachmentPreview(filePath: string): Promise<{ previewUrl: string; thumbnailUrl?: string }> {
  const task = attachmentPreviewQueue.then(async () => {
    const previewUrl = await attachmentPreviewDataUrl(filePath)
    const thumbnailUrl = previewUrl.startsWith('data:image/') ? await downscaleDataUrlForPreview(previewUrl) : undefined
    return { previewUrl, thumbnailUrl }
  })
  attachmentPreviewQueue = task.then(() => undefined, () => undefined)
  return task
}

/** Validate source bytes independently of the thumbnail's intentional placeholder on decode failure. */
export async function loadChipImage(filePath: string, label: string, previewSource?: Blob | null): Promise<LoadedChipImage> {
  if (previewSource && previewSource.size > 0) {
    const read = await validateComposerImage(await imageFromBlob(previewSource, label), label)
    return { preview: read.ok ? { previewUrl: URL.createObjectURL(previewSource) } : {}, read }
  }
  const { previewUrl, thumbnailUrl } = await queuedAttachmentPreview(filePath)
  const read = await validateComposerImage(imageFromDataUrl(previewUrl, label), label)
  return { preview: thumbnailUrl ? { thumbnailUrl } : { previewUrl }, read }
}
