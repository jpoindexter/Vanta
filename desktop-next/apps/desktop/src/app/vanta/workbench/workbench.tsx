import { IconX } from '@tabler/icons-react'
import { type KeyboardEvent, useRef } from 'react'

import { WORKBENCH_COPY } from '../copy'
import { WORKBENCH_TABS, type WorkbenchProps, type WorkbenchTab } from '../types'
import { VpButton } from '../ui/button'
import { ChangesTab } from './changes-tab'
import { FilesTab } from './files-tab'
import { BrowserTab, OutputsTab, TerminalTab } from './live-tabs'
import { TabBody } from './tab-state'

function nextTab(current: WorkbenchTab, key: string): WorkbenchTab | null {
  const index = WORKBENCH_TABS.indexOf(current)
  const last = WORKBENCH_TABS.length - 1

  if (key === 'ArrowRight') {
    return WORKBENCH_TABS[index === last ? 0 : index + 1]
  }

  if (key === 'ArrowLeft') {
    return WORKBENCH_TABS[index === 0 ? last : index - 1]
  }

  if (key === 'Home') {
    return WORKBENCH_TABS[0]
  }

  return key === 'End' ? WORKBENCH_TABS[last] : null
}

function Body(props: WorkbenchProps) {
  const retry = () => props.onRetry(props.tab)

  switch (props.tab) {
    case 'changes':
      return (
        <TabBody
          emptyText={data => (data.files.length === 0 ? WORKBENCH_COPY.noChanges : null)}
          onRetry={retry}
          state={props.changes}
        >
          {data => <ChangesTab data={data} onRestore={props.onRestore} />}
        </TabBody>
      )
    case 'files':
      return (
        <TabBody onRetry={retry} state={props.files}>
          {data => <FilesTab data={data} onSelectFile={props.onSelectFile} />}
        </TabBody>
      )
    case 'browser':
      return (
        <TabBody onRetry={retry} state={props.browser}>
          {data => <BrowserTab data={data} preview={props.slots?.browserPreview} />}
        </TabBody>
      )
    case 'terminal':
      return (
        <TabBody onRetry={retry} state={props.terminal}>
          {data => <TerminalTab data={data} live={props.slots?.terminalLive} />}
        </TabBody>
      )
    case 'outputs':
      return (
        <TabBody
          emptyText={data => (data.items.length === 0 ? WORKBENCH_COPY.noOutputs : null)}
          onRetry={retry}
          state={props.outputs}
        >
          {data => <OutputsTab data={data} onOpen={props.onOpenOutput} />}
        </TabBody>
      )
  }
}

/** Closed by default and opened only by user intent: the shell mounts this when asked. */
export function Workbench(props: WorkbenchProps) {
  const { mode, onClose, onTabChange, tab } = props
  const tabRefs = useRef<Partial<Record<WorkbenchTab, HTMLButtonElement | null>>>({})

  const handleKeyDown = (event: KeyboardEvent) => {
    const target = nextTab(tab, event.key)

    if (target) {
      event.preventDefault()
      onTabChange(target)
      tabRefs.current[target]?.focus()
    }
  }

  return (
    <aside aria-label={WORKBENCH_COPY.label} className={`vp vp-wb${mode === 'docked' ? '' : ` vp-wb--${mode}`}`} onKeyDown={event => event.key === 'Escape' && onClose()}>
      <div className="vp-wb__tabs">
        <div aria-label={WORKBENCH_COPY.label} className="vp-wb__tablist" onKeyDown={handleKeyDown} role="tablist">
          {WORKBENCH_TABS.map(id => (
            <VpButton
              aria-controls="vp-wb-panel"
              aria-selected={tab === id}
              id={`vp-wb-tab-${id}`}
              key={id}
              onClick={() => onTabChange(id)}
              ref={node => {
                tabRefs.current[id] = node
              }}
              role="tab"
              tabIndex={tab === id ? 0 : -1}
            >
              {WORKBENCH_COPY.tabs[id]}
            </VpButton>
          ))}
        </div>
        <VpButton aria-label={WORKBENCH_COPY.close} className="vp-wb__close" onClick={onClose}>
          <IconX aria-hidden size={14} stroke={2} />
        </VpButton>
      </div>
      <div aria-labelledby={`vp-wb-tab-${tab}`} className="vp-wb__body" id="vp-wb-panel" role="tabpanel">
        <Body {...props} />
      </div>
    </aside>
  )
}
