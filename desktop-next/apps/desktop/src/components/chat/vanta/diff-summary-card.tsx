import { type FC, Fragment } from 'react'

export interface DiffSummaryFile {
  added: number
  /** Stable identity, handed back to onOpenFile (the path exactly as the tool reported it). */
  id: string
  /** Shown path; full so two files of one name stay apart. */
  label: string
  removed: number
}

export interface DiffSummaryCardProps {
  files: readonly DiffSummaryFile[]
  /** Opens the diff for one file. Optional; the card still reads without it. */
  onOpenFile?: (id: string) => void
  /** Opens the review surface. The card never opens it by itself. */
  onReview: () => void
}

const MAX_NAMED_FILES = 3
const MINUS = '−'

const countLabel = (count: number): string => `Edited ${count} ${count === 1 ? 'file' : 'files'}`

/** "+24 −6": additions and removals for one file, with a true minus sign. */
export const diffStat = (file: Pick<DiffSummaryFile, 'added' | 'removed'>): string =>
  `+${file.added} ${MINUS}${file.removed}`

/** Summary of one turn's edits. Review changes is the only way into the workbench. */
export const DiffSummaryCard: FC<DiffSummaryCardProps> = ({ files, onOpenFile, onReview }) => {
  if (files.length === 0) {
    return null
  }

  const named = files.slice(0, MAX_NAMED_FILES)
  const hidden = files.length - named.length

  return (
    <section aria-label="Changes in this reply" className="vp-card" data-vp="diff-card">
      <div className="vp-diff">
        <div className="vp-diff-text">
          <h4>{countLabel(files.length)}</h4>
          <div className="vp-sub vp-diff-files">
            {named.map((file, index) => (
              <Fragment key={file.id}>
                {index > 0 && ' · '}
                {onOpenFile ? (
                  <button className="vp-link" onClick={() => onOpenFile(file.id)} type="button">
                    {file.label}
                  </button>
                ) : (
                  file.label
                )}{' '}
                {diffStat(file)}
              </Fragment>
            ))}
            {hidden > 0 && ` · ${hidden} more`}
          </div>
        </div>
        <button className="vp-btn" data-vp="diff-review" onClick={onReview} type="button">
          Review changes
        </button>
      </div>
    </section>
  )
}
