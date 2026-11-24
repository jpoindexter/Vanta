import { useStore } from '@nanostores/react'
import { type FC, useState } from 'react'

import { useSessionView } from '@/app/chat/session-view'
import { ChevronRight, FileText } from '@/lib/icons'
import { normalizeOrLocalPreviewTarget } from '@/lib/local-preview'
import { previewName } from '@/lib/preview-targets'
import { cn } from '@/lib/utils'
import { notifyError } from '@/store/notifications'
import { $previewTabSources, closePreviewForSource, openPreview } from '@/store/preview'

import { formatBytes, type OutputFile, outputKind } from './output-files'

const UNAVAILABLE = "Couldn't open this output."

/**
 * One file the agent made this turn. Click opens it in the side pane; click
 * again closes it. The Outputs page lists the same file, so the card is a
 * shortcut, not a second home.
 */
export const OutputCard: FC<{ file: OutputFile }> = ({ file }) => {
  const cwd = useStore(useSessionView().$cwd)
  const openSources = useStore($previewTabSources)
  const [opening, setOpening] = useState(false)
  const isOpen = openSources.includes(file.path)
  const meta = ['Output', outputKind(file.path), formatBytes(file.bytes)].filter(Boolean).join(' · ')

  async function toggle() {
    if (opening) {
      return
    }

    if (isOpen) {
      closePreviewForSource(file.path)

      return
    }

    setOpening(true)

    try {
      const preview = await normalizeOrLocalPreviewTarget(file.path, cwd || undefined)

      if (!preview) {
        throw new Error(`${file.path} is not on this computer.`)
      }

      openPreview(preview)
    } catch (error) {
      notifyError(error, UNAVAILABLE)
    } finally {
      setOpening(false)
    }
  }

  return (
    <button
      aria-expanded={isOpen}
      className={cn(
        'flex w-full max-w-160 items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 text-left transition-colors hover:bg-accent/40 disabled:opacity-60',
        isOpen ? 'border-foreground' : 'border-border'
      )}
      data-slot="output-card"
      disabled={opening}
      onClick={() => void toggle()}
      type="button"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui font-semibold text-foreground" title={file.path}>
          {previewName(file.path)}
        </span>
        <span className="block truncate text-meta text-muted-foreground">{meta}</span>
      </span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  )
}

export const OutputCards: FC<{ files: readonly OutputFile[] }> = ({ files }) =>
  files.length === 0 ? null : (
    <div className="mt-3 flex flex-col gap-2">
      {files.map(file => (
        <OutputCard file={file} key={file.path} />
      ))}
    </div>
  )
