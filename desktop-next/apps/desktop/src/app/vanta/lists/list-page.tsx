import { LIST_COPY, type ListPageId } from '../copy'
import type { ListPageProps } from '../types'
import { Block } from '../ui/block'
import { VpButton } from '../ui/button'
import { VpRow } from '../ui/row'

const LIST_SKELETON_ROWS = 4

interface ListPageViewProps extends ListPageProps {
  page: ListPageId
}

/** Shared list-page layout: title, subtitle, one primary CTA, bordered rows. */
export function ListPage({ onPrimary, onRetry, onRowAction, page, rows }: ListPageViewProps) {
  const copy = LIST_COPY[page]

  return (
    <div aria-label={copy.title} className="vp vp-page" data-testid="page" role="region">
      <div className="vp-col" data-testid="page-column">
        <div className="vp-sechead">
          <div>
            <h2 className="vp-page-title" data-testid="listpage-title">{copy.title}</h2>
            <p className="vp-muted" data-testid="listpage-sub">
              {copy.subtitle}
            </p>
          </div>
          <VpButton data-testid="listpage-cta" onClick={onPrimary} variant="primary">
            {copy.cta}
          </VpButton>
        </div>
        <Block
          empty={
            <div className="vp-box">
              <div className="vp-row">
                <span>{copy.empty}</span>
                <VpButton onClick={onPrimary} variant="primary">
                  {copy.cta}
                </VpButton>
              </div>
            </div>
          }
          errorLabel={copy.error}
          onRetry={onRetry}
          skeletonRows={LIST_SKELETON_ROWS}
          state={rows}
        >
          {items =>
            items.map(row => (
              <VpRow
                actions={
                  <VpButton aria-label={`${row.actionLabel}: ${row.title}`} onClick={() => onRowAction(row.id)}>
                    {row.actionLabel}
                  </VpButton>
                }
                detail={row.detail}
                icon={row.icon}
                key={row.id}
                title={row.title}
              />
            ))
          }
        </Block>
      </div>
    </div>
  )
}
