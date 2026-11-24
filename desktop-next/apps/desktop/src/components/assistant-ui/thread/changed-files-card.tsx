import { useAuiState } from '@assistant-ui/react'
import { useStore } from '@nanostores/react'
import { type FC, useMemo, useRef } from 'react'

import { useComposerScope } from '@/app/chat/composer/scope'
import { useSessionView } from '@/app/chat/session-view'
import { type ChangedFile, deriveChangedFiles } from '@/components/assistant-ui/thread/changed-files'
import { DiffSummaryCard } from '@/components/chat/vanta/diff-summary-card'
import { displayPath } from '@/lib/display-path'
import { openReviewForPath, revealReview } from '@/store/review'

/**
 * The turn's changed files, recomputed only when an edit lands. Selecting the
 * parts array directly would re-run the diff stats on every streaming flush.
 */
function useMessageChangedFiles(): readonly ChangedFile[] {
  const cache = useRef<null | { files: ChangedFile[]; key: string }>(null)

  return useAuiState(state => {
    const parts = state.message.parts

    const key = parts
      .map(part => (part.type === 'tool-call' ? `${part.toolCallId}:${part.result === undefined ? 0 : 1}` : ''))
      .join('|')

    if (cache.current?.key !== key) {
      cache.current = { files: deriveChangedFiles(parts), key }
    }

    return cache.current.files
  })
}

/**
 * "Edited N files" summary for the message's file edits, with a Review changes
 * button. It sits where the last edit landed and never opens the workbench on
 * its own: review opens only from the button or a file link.
 */
export const ChangedFilesCard: FC = () => {
  const changed = useMessageChangedFiles()

  const files = useMemo(
    () => changed.map(file => ({ ...file, id: file.path, label: displayPath(file.path) })),
    [changed]
  )

  // Review THIS surface's repo: a tile transcript pins the pane to the tile's
  // worktree; the primary passes null (follow the active session, as before).
  const view = useSessionView()
  const viewCwd = useStore(view.$cwd)
  const scopeCwd = view.kind === 'primary' ? null : viewCwd || null
  const composerScope = useComposerScope()

  return (
    <DiffSummaryCard
      files={files}
      onOpenFile={id => void openReviewForPath(id, scopeCwd, composerScope.target)}
      onReview={() => revealReview(scopeCwd, composerScope.target)}
    />
  )
}
