import { useCallback } from 'react'
import { selectDesktopPaths } from '@/lib/desktop-fs'

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|bmp|tiff?|svg|ico)$/i
export const isImagePath = (filePath: string): boolean => IMAGE_EXTENSION_PATTERN.test(filePath)

interface AttachmentPickerOptions {
  currentCwd: string
  imagesTitle: string
  imagesLabel: string
  attachImage: (path: string, preview?: Blob | null, isCurrent?: () => boolean) => Promise<boolean>
  attachFile: (path: string) => boolean
}

/** The existing image picker plus Home's mixed-file entry share the same byte/path ingestion. */
export function useAttachmentPickers(options: AttachmentPickerOptions) {
  const { currentCwd, imagesTitle, imagesLabel, attachImage, attachFile } = options
  const pickImages = useCallback(async () => {
    const paths = await selectDesktopPaths({
      title: imagesTitle,
      defaultPath: currentCwd || undefined,
      filters: [{ name: imagesLabel, extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff'] }]
    })
    for (const path of paths ?? []) await attachImage(path)
  }, [attachImage, currentCwd, imagesLabel, imagesTitle])
  const pickAttachments = useCallback(async (isCurrent: () => boolean = () => true) => {
    if (!isCurrent()) return
    const paths = await selectDesktopPaths({ title: 'Add files as context', defaultPath: currentCwd || undefined })
    for (const path of paths ?? []) {
      if (!isCurrent()) return
      if (isImagePath(path)) await attachImage(path, undefined, isCurrent)
      else attachFile(path)
    }
  }, [attachFile, attachImage, currentCwd])
  return { pickAttachments, pickImages }
}
