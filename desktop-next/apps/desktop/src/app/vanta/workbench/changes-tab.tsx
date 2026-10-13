import { WORKBENCH_COPY } from '../copy'
import type { ChangesData } from '../types'
import { VpButton } from '../ui/button'

/** Counts use a true minus sign, as drawn in the wireframe. */
export function formatCounts(added: number, removed: number): string {
  return `+${added} −${removed}`
}

export function ChangesTab({ data, onRestore }: { data: ChangesData; onRestore: () => void }) {
  return (
    <>
      {data.files.map(file => (
        <div key={file.path}>
          <div className="vp-row" data-testid="list-row">
            <span>{file.path}</span>
            <span>{formatCounts(file.added, file.removed)}</span>
          </div>
          {file.diff && <div className="vp-code" data-testid="workbench-code" style={{ marginTop: 8 }}>{file.diff}</div>}
        </div>
      ))}
      <div className="vp-acts" style={{ marginTop: 10 }}>
        <VpButton data-testid="workbench-action" onClick={onRestore}>{WORKBENCH_COPY.restore}</VpButton>
      </div>
    </>
  )
}
