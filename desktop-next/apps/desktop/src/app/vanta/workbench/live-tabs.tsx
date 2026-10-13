import type { ReactNode } from 'react'

import { WORKBENCH_COPY } from '../copy'
import type { BrowserData, OutputsData, TerminalData } from '../types'
import { VpButton } from '../ui/button'
import { VpSimpleRow } from '../ui/row'

const PREVIEW_MIN_HEIGHT = 260

export function BrowserTab({ data, preview }: { data: BrowserData; preview?: ReactNode }) {
  return (
    <>
      <div className="vp-urlbar">
        <input aria-label={WORKBENCH_COPY.address} readOnly value={data.url} />
      </div>
      {preview ?? (
        <div className="vp-ph" style={{ minHeight: PREVIEW_MIN_HEIGHT }}>
          {WORKBENCH_COPY.pagePreview}
        </div>
      )}
    </>
  )
}

export function TerminalTab({ data, live }: { data: TerminalData; live?: ReactNode }) {
  return (
    <>
      <div className="vp-code" role="log">
        {data.output}
      </div>
      {live ?? <div className="vp-ph">{WORKBENCH_COPY.liveOutput}</div>}
    </>
  )
}

export function OutputsTab({ data, onOpen }: { data: OutputsData; onOpen: (id: string) => void }) {
  return (
    <>
      {data.items.map(item => (
        <VpSimpleRow
          actions={
            <VpButton aria-label={`${WORKBENCH_COPY.open} ${item.name}`} onClick={() => onOpen(item.id)}>
              {WORKBENCH_COPY.open}
            </VpButton>
          }
          icon="file"
          key={item.id}
          title={item.name}
        />
      ))}
    </>
  )
}
