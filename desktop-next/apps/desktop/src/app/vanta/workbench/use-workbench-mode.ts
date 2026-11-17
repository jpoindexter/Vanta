import { useEffect, useState } from 'react'

import type { WorkbenchMode } from '../types'

import { workbenchModeFor } from './mode'

/** Current docked / overlay / sheet mode for this window width. */
export function useWorkbenchMode(): WorkbenchMode {
  const [width, setWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)

    window.addEventListener('resize', onResize)

    return () => window.removeEventListener('resize', onResize)
  }, [])

  return workbenchModeFor(width)
}
