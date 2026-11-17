import { useStore } from '@nanostores/react'
import type { FC } from 'react'

import { $vantaToast } from '@/store/vanta-toast'

/** A one-line confirmation near the bottom of the chat; it announces itself politely and clears by itself. */
export const VantaToast: FC = () => {
  const text = useStore($vantaToast)

  return text ? (
    <div className="vp-toast" data-vp="toast" role="status">
      {text}
    </div>
  ) : null
}
