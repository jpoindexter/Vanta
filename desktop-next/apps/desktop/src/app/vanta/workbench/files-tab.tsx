import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { Fragment, useState } from 'react'

import { WORKBENCH_COPY } from '../copy'
import type { FileNode, FilesData } from '../types'

const INDENT_PX = 16

interface TreeProps {
  nodes: FileNode[]
  onSelect: (path: string) => void
  open: Set<string>
  parent: string
  selected: string | null
  toggle: (path: string) => void
  depth: number
}

function Tree({ depth, nodes, onSelect, open, parent, selected, toggle }: TreeProps) {
  return nodes.map(node => {
    const path = parent ? `${parent}/${node.name}` : node.name
    const isFolder = node.children !== undefined
    const isOpen = open.has(path)

    return (
      <Fragment key={path}>
        <button
          aria-current={selected === path}
          aria-expanded={isFolder ? isOpen : undefined}
          onClick={() => (isFolder ? toggle(path) : onSelect(path))}
          style={{ paddingLeft: depth * INDENT_PX }}
          type="button"
        >
          {isFolder ? (
            isOpen ? <IconChevronDown aria-hidden size={12} stroke={2} /> : <IconChevronRight aria-hidden size={12} stroke={2} />
          ) : (
            <span aria-hidden style={{ width: 12 }} />
          )}
          {node.name}
        </button>
        {isFolder && isOpen && (
          <Tree depth={depth + 1} nodes={node.children ?? []} onSelect={onSelect} open={open} parent={path} selected={selected} toggle={toggle} />
        )}
      </Fragment>
    )
  })
}

function initialOpen(nodes: FileNode[], parent = ''): Set<string> {
  const open = new Set<string>()

  for (const node of nodes) {
    const path = parent ? `${parent}/${node.name}` : node.name

    if (node.children?.length) {
      open.add(path)
      initialOpen(node.children, path).forEach(p => open.add(p))
    }
  }

  return open
}

export function FilesTab({ data, onSelectFile }: { data: FilesData; onSelectFile: (path: string) => void }) {
  const [open, setOpen] = useState(() => initialOpen(data.roots))
  const [selected, setSelected] = useState<string | null>(data.preview?.path ?? null)

  const toggle = (path: string) =>
    setOpen(prev => {
      const next = new Set(prev)

      if (!next.delete(path)) {
        next.add(path)
      }

      return next
    })

  const select = (path: string) => {
    setSelected(path)
    onSelectFile(path)
  }

  return (
    <>
      <div aria-label="Files" className="vp-code vp-tree" data-testid="workbench-code" role="group">
        <Tree depth={0} nodes={data.roots} onSelect={select} open={open} parent="" selected={selected} toggle={toggle} />
      </div>
      {data.preview ? (
        <div aria-label={data.preview.path} className="vp-code" data-testid="workbench-code" role="region">
          {data.preview.text}
        </div>
      ) : (
        <div className="vp-ph" data-testid="workbench-placeholder">
          {WORKBENCH_COPY.filePreview}
        </div>
      )}
    </>
  )
}
