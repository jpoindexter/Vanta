import { useState } from 'react'
import type { HomeDraftControl } from '../types'

/** Local input stays responsive; production synchronously checkpoints each user edit. */
export function useHomeComposerDraft(draft?: HomeDraftControl) {
  const [value, setValue] = useState(draft?.initial.text ?? '')
  const [projectId, setProjectId] = useState(draft?.initial.projectId ?? null)
  const change = (text: string, project: string | null) => {
    setValue(text)
    setProjectId(project)
    draft?.change({ text, projectId: project })
  }
  return { value, projectId, change, clear: () => { if (!draft) setValue('') } }
}
