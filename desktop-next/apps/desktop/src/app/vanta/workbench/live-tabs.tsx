import type { ReactNode } from 'react'

import { WORKBENCH_COPY } from '../copy'
import type { BrowserData, OutputsData, TerminalData } from '../types'
import { VpButton } from '../ui/button'
import { VpSimpleRow } from '../ui/row'

const PREVIEW_MIN_HEIGHT = 260

export function BrowserTab({ data, preview }: { data: BrowserData; preview?: ReactNode }) {
  return (
    <>
      <div
        aria-label={WORKBENCH_COPY.address}
        aria-readonly="true"
        className="vp-urlbar"
        data-testid="workbench-urlbar"
        role="textbox"
        tabIndex={0}
      >
        {data.url}
      </div>
      {preview ?? (
        <div className="vp-ph" data-testid="workbench-placeholder" style={{ minHeight: PREVIEW_MIN_HEIGHT }}>
          {WORKBENCH_COPY.pagePreview}
        </div>
      )}
    </>
  )
}

export function TerminalTab({ data, live }: { data: TerminalData; live?: ReactNode }) {
  return (
    <>
      <div className="vp-code" data-testid="workbench-code" role="log">
        {data.output}
      </div>
      {live ?? (
        <div className="vp-ph" data-testid="workbench-placeholder">
          {WORKBENCH_COPY.liveOutput}
        </div>
      )}
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
